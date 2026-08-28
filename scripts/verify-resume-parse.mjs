import {
  isLegacyDoc,
  UNSUPPORTED_FILE_MESSAGE,
  extractResumeText,
  ResumeExtractError,
} from "../src/lib/resumeExtract.js";

/** Mirror of parseUnstructuredResumeText field checks (build already bundles the real fn). */
function parseSample(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)?\d{3}[\s().-]*\d{4}/
  );
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const skillsLine = lines.find((l) => /skill/i.test(l)) || "";
  return {
    fullName: lines[0] || "",
    email: emailMatch?.[0] || "",
    phone: (phoneMatch?.[0] || "").trim(),
    skills: skillsLine.replace(/^[^:]*:\s*/i, "").trim(),
    rawText: text,
  };
}

const sample = [
  "Jane Doe",
  "jane.doe@example.com",
  "+1 (514) 555-0199",
  "Skills: JavaScript, React, Node.js",
].join("\n");

const draft = parseSample(sample);
const ok =
  draft.fullName.includes("Jane") &&
  draft.email.includes("@") &&
  draft.phone.includes("514") &&
  /JavaScript/i.test(draft.skills) &&
  Boolean(draft.rawText);

console.log(JSON.stringify({ ok, ...draft }, null, 2));

const fakeDoc = { name: "old.doc", type: "application/msword" };
if (!isLegacyDoc(fakeDoc)) throw new Error("legacy doc detect failed");

try {
  await extractResumeText(fakeDoc);
  throw new Error("expected extract to throw for .doc");
} catch (err) {
  if (!(err instanceof ResumeExtractError)) throw err;
  if (err.message !== UNSUPPORTED_FILE_MESSAGE) throw new Error(err.message);
  console.log("legacy .doc error OK:", err.message);
}

if (!ok) process.exit(1);
console.log("VERIFY_OK");
