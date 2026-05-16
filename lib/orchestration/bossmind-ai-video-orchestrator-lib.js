/**
 * BossMind AI Video — single-step orchestration (Railway worker / cron).
 * Each invocation advances at most one atomic step for one queue row.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const providers = require("./bossmind-ai-video-providers.js");
const videoStore = require("./bossmind-ai-video-store.js");

async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

function workspaceDir(queueId) {
  const root =
    process.env.BOSSMIND_AI_VIDEO_WORKSPACE || path.join(require("os").tmpdir(), "bossmind-ai-video");
  return path.join(root, `q-${queueId}`);
}

async function failQueue(sql, queueId, message, step) {
  const row = await videoStore.getQueueById(sql, queueId);
  const prev = row?.payload && typeof row.payload === "object" ? row.payload : {};
  await videoStore.updateQueue(sql, queueId, {
    status: "failed",
    payload: { ...prev, errorStep: step, error: message, at: new Date().toISOString() },
  });
  await videoStore.logVideoError(sql, { queueId, step, message });
}

async function runOrchestratorStep(sql) {
  const pk = videoStore.projectKey();
  const rows = await sql(
    `SELECT * FROM video_queue
     WHERE project_key = $1
       AND status IN ('scenario_build', 'generating', 'rendering', 'publishing')
     ORDER BY priority DESC, id ASC
     LIMIT 1`,
    [pk]
  );
  const q = rows?.[0];
  if (!q) {
    return { ran: false, note: "no active pipeline rows" };
  }

  /** @type {any} */
  const payload = q.payload || {};

  try {
    if (q.status === "scenario_build") {
      const script = await videoStore.getScriptForQueue(sql, q.id);
      const text = (script?.reviewed_text || script?.raw_text || "").trim();
      if (!text) {
        await failQueue(sql, q.id, "No script text on video_scripts", "scenario_build");
        return { ran: true, failed: true };
      }
      if (process.env.BOSSMIND_AI_VIDEO_REQUIRE_SCRIPT_APPROVAL === "1") {
        const rs = script?.review_status;
        if (rs != null && rs !== "approved") {
          await failQueue(sql, q.id, "review_status must be approved (or unset)", "scenario_build");
          return { ran: true, failed: true };
        }
      }
      const { structured, model, rawUsage } = await providers.deepseekScenarioFromScript({
        scriptText: text,
        language: q.language || "en",
      });

      await videoStore.logApiUsage(sql, {
        provider: "deepseek",
        operation: "scenario",
        units: rawUsage?.total_tokens ?? null,
        cost_usd: null,
        external_id: null,
        meta: { model },
      });

      const sc = await videoStore.insertScenario(sql, {
        scriptId: script.id,
        structured,
        model_used: model,
        status: "approved",
      });

      const sceneArr = Array.isArray(structured.scenes) ? structured.scenes : [];
      let idx = 0;
      for (const s of sceneArr) {
        await videoStore.insertScene(sql, {
          scenario_id: sc.id,
          scene_index: s.index != null ? Number(s.index) : idx,
          prompt: typeof s === "string" ? s : s.prompt || JSON.stringify(s),
          duration_sec: s.durationSec != null ? Number(s.durationSec) : null,
          provider:
            (typeof s === "object" && s.provider) ||
            process.env.BOSSMIND_AI_VIDEO_DEFAULT_SCENE_PROVIDER ||
            "webhook",
          status: "pending",
          meta: typeof s === "object" && s.visualStyle ? { visualStyle: s.visualStyle } : {},
        });
        idx++;
      }

      await videoStore.updateQueue(sql, q.id, {
        status: "generating",
        payload: { ...payload, scenarioId: sc.id, orchestratorAt: new Date().toISOString() },
      });
      return { ran: true, step: "scenario_build", queueId: q.id };
    }

    if (q.status === "generating") {
      const scenarioId = payload.scenarioId;
      if (!scenarioId) {
        await failQueue(sql, q.id, "missing payload.scenarioId", "generating");
        return { ran: true, failed: true };
      }
      const scenes = await videoStore.listScenesForScenario(sql, scenarioId);
      const pending = scenes.filter((s) => s.status !== "ready" && s.status !== "skipped");
      for (const scene of pending) {
        const maxR = Number(process.env.BOSSMIND_AI_VIDEO_MAX_SCENE_RETRIES || 5);
        if (scene.status === "failed" && (scene.retry_count || 0) >= maxR) {
          await failQueue(sql, q.id, `Scene ${scene.id} exceeded retries`, "generating");
          return { ran: true, failed: true };
        }
        try {
          const media = await providers.requestSceneMediaFromWebhook({
            scene,
            prompt: scene.prompt,
            providerHint: scene.provider,
          });
          const localVideo = path.join(workspaceDir(q.id), `scene-${scene.scene_index}.mp4`);
          await downloadToFile(media.assetUrl, localVideo);
          await videoStore.insertAsset(sql, {
            scene_id: scene.id,
            asset_type: "raw_video",
            storage_uri: media.assetUrl,
            mime: media.mime,
            byte_size: fs.statSync(localVideo).size,
            meta: media.meta || {},
          });
          await videoStore.updateScene(sql, scene.id, { status: "ready" });
          await videoStore.logApiUsage(sql, {
            provider: "scene_webhook",
            operation: "scene",
            units: 1,
            meta: { sceneId: scene.id },
          });
        } catch (e) {
          await videoStore.updateScene(sql, scene.id, {
            status: "failed",
            error_message: (e.message || String(e)).slice(0, 2000),
            retry_count: (scene.retry_count || 0) + 1,
          });
          return { ran: true, step: "generating_scene_error", sceneId: scene.id };
        }
        return { ran: true, step: "generating_scene", sceneId: scene.id };
      }

      const narr = scenes
        .map((s) => s.prompt || "")
        .join("\n")
        .trim();
      const audioOut = path.join(workspaceDir(q.id), "voiceover.mp3");
      if (!fs.existsSync(audioOut)) {
        await providers.openAiSpeechTts({ text: (narr || q.title || "Video").slice(0, 4000), outPath: audioOut });
        await videoStore.insertAsset(sql, {
          scene_id: null,
          asset_type: "voiceover",
          storage_uri: `file://${audioOut}`,
          mime: "audio/mpeg",
          byte_size: fs.statSync(audioOut).size,
          meta: {},
        });
        await videoStore.logApiUsage(sql, { provider: "openai", operation: "tts", units: 1 });
        return { ran: true, step: "tts" };
      }

      const srtOut = path.join(workspaceDir(q.id), "captions.srt");
      if (!fs.existsSync(srtOut)) {
        const tr = await providers.openAiWhisperTranscribe({ audioPath: audioOut });
        fs.writeFileSync(srtOut, `1\n00:00:00,000 --> 00:00:10,000\n${tr.text}\n`);
        await videoStore.insertAsset(sql, {
          scene_id: null,
          asset_type: "subtitle",
          storage_uri: `file://${srtOut}`,
          mime: "text/plain",
          byte_size: fs.statSync(srtOut).size,
          meta: {},
        });
        return { ran: true, step: "subtitles" };
      }

      await videoStore.updateQueue(sql, q.id, { status: "rendering" });
      return { ran: true, step: "generating_done" };
    }

    if (q.status === "rendering") {
      const scenarioId = payload.scenarioId;
      const scenes = await videoStore.listScenesForScenario(sql, scenarioId);
      const dir = workspaceDir(q.id);
      const listFile = path.join(dir, "concat.txt");
      const lines = scenes
        .filter((s) => s.status === "ready")
        .sort((a, b) => a.scene_index - b.scene_index)
        .map((s) => `file '${path.join(dir, `scene-${s.scene_index}.mp4`).replace(/\\/g, "/")}'`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(listFile, lines.join("\n"));

      let render = await videoStore.getActiveRenderForScenario(sql, scenarioId);
      if (!render) {
        render = await videoStore.insertRender(sql, { scenarioId, status: "running", meta: {} });
        await videoStore.updateRender(sql, render.id, {
          started_at: new Date().toISOString(),
          progress_pct: 5,
        });
      }

      const outMp4 = path.join(dir, "master.mp4");
      const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
      const r = spawnSync(
        ffmpegBin,
        ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outMp4],
        { encoding: "utf8" }
      );
      if (r.status !== 0) {
        await videoStore.updateRender(sql, render.id, {
          status: "failed",
          log_tail: (r.stderr || r.stdout || "").slice(-4000),
          finished_at: new Date().toISOString(),
        });
        await failQueue(sql, q.id, `ffmpeg failed: ${(r.stderr || "").slice(0, 500)}`, "rendering");
        return { ran: true, failed: true };
      }

      const st = fs.statSync(outMp4);
      const asset = await videoStore.insertAsset(sql, {
        scene_id: null,
        asset_type: "final_mux",
        storage_uri: `file://${outMp4}`,
        mime: "video/mp4",
        byte_size: st.size,
        meta: {},
      });
      await videoStore.updateRender(sql, render.id, {
        status: "completed",
        progress_pct: 100,
        output_asset_id: asset.id,
        finished_at: new Date().toISOString(),
        log_tail: "ffmpeg ok",
      });

      await videoStore.updateQueue(sql, q.id, {
        status: "publishing",
        payload: { ...payload, renderId: render.id, finalAssetId: asset.id },
      });
      return { ran: true, step: "rendering" };
    }

    if (q.status === "publishing") {
      const renderId = payload.renderId;
      if (!renderId) {
        await failQueue(sql, q.id, "missing renderId", "publishing");
        return { ran: true, failed: true };
      }
      const renderRow = (
        await sql(`SELECT * FROM video_renders WHERE id = $1 AND project_key = $2`, [renderId, pk])
      )?.[0];
      if (!renderRow?.output_asset_id) {
        await failQueue(sql, q.id, "render has no output_asset_id", "publishing");
        return { ran: true, failed: true };
      }
      const assetRow = (await sql(`SELECT * FROM video_assets WHERE id = $1`, [renderRow.output_asset_id]))?.[0];
      const manifest = {
        fileUri: assetRow?.storage_uri,
        title: q.title,
        language: q.language,
        queueId: q.id,
      };

      const platforms = Array.isArray(q.target_platforms) ? q.target_platforms : ["youtube"];
      for (const platform of platforms) {
        const done = await videoStore.hasSuccessfulPublish(sql, renderId, platform);
        if (done) continue;

        let pub;
        try {
          pub = await videoStore.insertPublishAttempt(sql, {
            renderId,
            platform,
            status: "uploading",
            payload: {},
          });
        } catch (e) {
          const msg = String(e.message || e);
          if (msg.includes("duplicate") || msg.includes("unique") || e.code === "23505") {
            continue;
          }
          throw e;
        }

        try {
          const out = await providers.requestPublishFromWebhook({ platform, renderId, manifest });
          await videoStore.updatePublishLog(sql, pub.id, {
            status: "published",
            published_url: out.publishedUrl,
            payload: out.meta,
          });
        } catch (e) {
          await videoStore.updatePublishLog(sql, pub.id, {
            status: "failed",
            error: (e.message || String(e)).slice(0, 2000),
          });
          await failQueue(sql, q.id, `publish ${platform}: ${e.message}`, "publishing");
          return { ran: true, failed: true };
        }
      }

      await videoStore.updateQueue(sql, q.id, { status: "done" });
      return { ran: true, step: "publishing_done", queueId: q.id };
    }
  } catch (e) {
    const msg = e.message || String(e);
    await failQueue(sql, q.id, msg, q.status);
    return { ran: true, failed: true, error: msg };
  }

  return { ran: false };
}

module.exports = { runOrchestratorStep, workspaceDir };
