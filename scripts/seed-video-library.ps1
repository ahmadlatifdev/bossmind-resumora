<#
.SYNOPSIS
  Upload Video Library masters to GCS and seed Firestore `videos` docs.

.DESCRIPTION
  Looks for 4 EN master MP4s (or EN/FR/ES variants) under -MastersDir
  (default: public/videos). Uploads to gs://$env:GCS_BUCKET_NAME/masters/
  (falls back to resumora-videos). Writes Firestore docs so
  GET /api/video/catalog returns source=firestore.

  Never prints secret values.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1 -MastersDir D:\path\to\mp4s

.EXAMPLE
  # After placing files in public/videos/:
  powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1
#>

[CmdletBinding()]
param(
  [string]$Project = "resumora-live",
  [string]$MastersDir = "",
  [string]$HostingBase = "https://resumora.net",
  [switch]$SkipUpload,
  [switch]$SkipFirestore
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $MastersDir) {
  $MastersDir = Join-Path $RepoRoot "public\videos"
}

$Bucket = $env:GCS_BUCKET_NAME
if (-not $Bucket) { $Bucket = $env:VEO_OUTPUT_BUCKET }
if (-not $Bucket) { $Bucket = "resumora-videos" }

$VideoIds = @(
  "vid-resume-writing",
  "vid-ats-optimization",
  "vid-linkedin-tips",
  "vid-interview-prep"
)

$Meta = @{
  "vid-resume-writing" = @{
    order = 1
    title_en = "Resume writing that gets interviews"
    title_fr = "Rediger un CV qui obtient des entretiens"
    title_es = "Redaccion de CV que consigue entrevistas"
    description_en = "Structure, impact bullets, and role targeting in 5 minutes."
    description_fr = "Structure, puces d impact et ciblage du poste en 5 minutes."
    description_es = "Estructura, logros medibles y enfoque al puesto en 5 minutos."
    voiceover_en = "Welcome to Resumora. In this lesson, structure your resume for impact: lead with a clear headline, write achievement bullets with metrics, and target every line to the role you want. Strong resumes get interviews."
    voiceover_fr = "Bienvenue sur Resumora. Dans cette lecon, structurez votre CV pour l impact: un titre clair, des puces de realisations avec des chiffres, et chaque ligne alignee sur le poste vise. Un CV fort obtient des entretiens."
    voiceover_es = "Bienvenido a Resumora. En esta leccion, estructure su CV con impacto: un titular claro, logros medibles y cada linea alineada al puesto deseado. Un CV solido consigue entrevistas."
  }
  "vid-ats-optimization" = @{
    order = 2
    title_en = "ATS optimization essentials"
    title_fr = "Essentiels de l optimisation ATS"
    title_es = "Fundamentos de optimizacion ATS"
    description_en = "Keywords, formatting, and parser-safe layouts recruiters rely on."
    description_fr = "Mots-cles, mise en forme et structures compatibles parseurs."
    description_es = "Palabras clave, formato y disenos seguros para parsers."
    voiceover_en = "Applicant tracking systems scan for keywords and clean structure. Mirror the job description language, avoid text boxes that break parsers, and keep headings standard so recruiters see you first."
    voiceover_fr = "Les ATS analysent les mots-cles et une structure propre. Reprenez le langage de l offre, evitez les zones de texte fragiles, et utilisez des titres standards pour etre visible."
    voiceover_es = "Los ATS buscan palabras clave y una estructura limpia. Refleje el lenguaje de la oferta, evite cajas de texto fragiles y use titulos estandar para que lo vean primero."
  }
  "vid-linkedin-tips" = @{
    order = 3
    title_en = "LinkedIn tips that sync with your resume"
    title_fr = "Astuces LinkedIn alignees sur votre CV"
    title_es = "Consejos LinkedIn alineados con su CV"
    description_en = "Headline, About, and experience alignment for recruiter search."
    description_fr = "Titre, A propos et experiences pour la recherche recruteurs."
    description_es = "Titular, Acerca de y experiencia para busquedas de reclutadores."
    voiceover_en = "Align LinkedIn with your resume. Craft a searchable headline, write an About section that proves value, and keep experience dates and titles consistent so recruiters trust your story."
    voiceover_fr = "Alignez LinkedIn sur votre CV. Creez un titre searchable, un A propos qui prouve votre valeur, et des experiences coherentes pour gagner la confiance des recruteurs."
    voiceover_es = "Alinee LinkedIn con su CV. Cree un titular buscable, un Acerca de que demuestre valor, y mantenga titulos y fechas coherentes para generar confianza."
  }
  "vid-interview-prep" = @{
    order = 4
    title_en = "Interview preparation that closes offers"
    title_fr = "Preparation d entretien qui conclut des offres"
    title_es = "Preparacion de entrevistas que cierra ofertas"
    description_en = "STAR answers, closing questions, and calm delivery under pressure."
    description_fr = "Reponses STAR, questions de cloture et aisance sous pression."
    description_es = "Respuestas STAR, cierre y dominio bajo presion."
    voiceover_en = "Prepare STAR stories, ask strong closing questions, and practice calm delivery under pressure. Clear answers and confident presence help you close the offer."
    voiceover_fr = "Preparez des recits STAR, posez de bonnes questions de cloture, et travaillez une aisance calme sous pression. Des reponses claires aident a conclure l offre."
    voiceover_es = "Prepare historias STAR, haga buenas preguntas de cierre y practique una entrega calmada bajo presion. Respuestas claras ayudan a cerrar la oferta."
  }
}

function Find-MasterFile {
  param([string]$Id, [string]$Lang)
  $candidates = @(
    (Join-Path $MastersDir "$Id-$Lang.mp4"),
    (Join-Path $MastersDir "$Id.$Lang.mp4"),
    (Join-Path $MastersDir "$Id`_$Lang.mp4")
  )
  if ($Lang -eq "en") {
    $candidates = @(
      (Join-Path $MastersDir "$Id.mp4"),
      (Join-Path $MastersDir "$Id-en.mp4"),
      (Join-Path $MastersDir "$Id.en.mp4")
    ) + $candidates
  }
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
  }
  return $null
}

function Get-PublicObjectUrl {
  param([string]$ObjectName)
  return ("https://storage.googleapis.com/{0}/{1}" -f $Bucket, $ObjectName)
}

Write-Host "==> Project $Project"
Write-Host "==> MastersDir $MastersDir"
Write-Host "==> Bucket (name only) configured"

if (-not (Test-Path -LiteralPath $MastersDir)) {
  New-Item -ItemType Directory -Force -Path $MastersDir | Out-Null
  Write-Warning "Created empty MastersDir. Place MP4s named vid-*-en.mp4 (or vid-*.mp4) then re-run."
}

$resolved = @{}
$missing = @()
foreach ($id in $VideoIds) {
  $en = Find-MasterFile -Id $id -Lang "en"
  if (-not $en) {
    $missing += $id
    continue
  }
  $resolved[$id] = @{
    en = $en
    fr = (Find-MasterFile -Id $id -Lang "fr")
    es = (Find-MasterFile -Id $id -Lang "es")
  }
  Write-Host ("Found {0}: EN={1}" -f $id, [IO.Path]::GetFileName($en))
}

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "MISSING masters for:"
  $missing | ForEach-Object { Write-Host ("  - {0}.mp4  (or {0}-en.mp4)" -f $_) }
  Write-Host ""
  Write-Host "Place files in:"
  Write-Host "  $MastersDir"
  Write-Host "Then re-run this script. Captions already live under public/subtitles/."
  if ($resolved.Count -eq 0) {
    throw "No master MP4s found - cannot upload or seed Firestore with playable URLs."
  }
}

& gcloud config set project $Project | Out-Null

if (-not $SkipUpload) {
  Write-Host "==> Upload masters + captions to GCS"
  foreach ($id in $resolved.Keys) {
    foreach ($lang in @("en", "fr", "es")) {
      $local = $resolved[$id][$lang]
      if (-not $local) { continue }
      $object = "masters/$id-$lang.mp4"
      & gcloud storage cp $local ("gs://{0}/{1}" -f $Bucket, $object) --project=$Project
      if ($LASTEXITCODE -ne 0) { throw "Upload failed for $object" }
    }
  }

  $capDir = Join-Path $RepoRoot "public\subtitles"
  if (Test-Path $capDir) {
    Get-ChildItem $capDir -Filter "*.vtt" | ForEach-Object {
      $object = "captions/$($_.Name)"
      & gcloud storage cp $_.FullName ("gs://{0}/{1}" -f $Bucket, $object) --project=$Project
      if ($LASTEXITCODE -ne 0) { throw "Caption upload failed for $($_.Name)" }
    }
  }

  Write-Host "==> Attempt public read on masters/ and captions/ (may fail under org policy)"
  & gcloud storage buckets add-iam-policy-binding ("gs://{0}" -f $Bucket) `
    --member=allUsers `
    --role=roles/storage.objectViewer `
    --project=$Project 2>$null | Out-Null
}

$token = & gcloud auth print-access-token
if (-not $token) { throw "Could not get access token" }

function Set-FirestoreVideo {
  param(
    [string]$Id,
    [hashtable]$Fields
  )
  $uri = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents/videos/$Id"
  $fsFields = @{}
  foreach ($key in $Fields.Keys) {
    $val = $Fields[$key]
    if ($val -is [int] -or $val -is [long] -or $val -is [double]) {
      $fsFields[$key] = @{ integerValue = [string][int]$val }
    } elseif ($val -is [bool]) {
      $fsFields[$key] = @{ booleanValue = [bool]$val }
    } else {
      $fsFields[$key] = @{ stringValue = [string]$val }
    }
  }
  $body = @{ fields = $fsFields } | ConvertTo-Json -Depth 8 -Compress
  Invoke-RestMethod -Method Patch -Uri $uri `
    -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
    -Body $body | Out-Null
  Write-Host "Firestore upserted videos/$Id"
}

if (-not $SkipFirestore) {
  Write-Host "==> Seed Firestore videos"
  foreach ($id in $resolved.Keys) {
    $m = $Meta[$id]
    $enUrl = Get-PublicObjectUrl -ObjectName "masters/$id-en.mp4"
    $frLocal = $resolved[$id].fr
    $esLocal = $resolved[$id].es
    $frUrl = if ($frLocal) { Get-PublicObjectUrl -ObjectName "masters/$id-fr.mp4" } else { $enUrl }
    $esUrl = if ($esLocal) { Get-PublicObjectUrl -ObjectName "masters/$id-es.mp4" } else { $enUrl }

    $fields = @{
      order            = [int]$m.order
      duration         = 300
      title_en         = $m.title_en
      title_fr         = $m.title_fr
      title_es         = $m.title_es
      title_EN         = $m.title_en
      title_FR         = $m.title_fr
      title_ES         = $m.title_es
      description_en   = $m.description_en
      description_fr   = $m.description_fr
      description_es   = $m.description_es
      description_EN   = $m.description_en
      description_FR   = $m.description_fr
      description_ES   = $m.description_es
      voiceover_en     = $m.voiceover_en
      voiceover_fr     = $m.voiceover_fr
      voiceover_es     = $m.voiceover_es
      url_mp4_en       = $enUrl
      url_mp4_fr       = $frUrl
      url_mp4_es       = $esUrl
      captions_en      = ("{0}/subtitles/{1}.en.vtt" -f $HostingBase.TrimEnd("/"), $id)
      captions_fr      = ("{0}/subtitles/{1}.fr.vtt" -f $HostingBase.TrimEnd("/"), $id)
      captions_es      = ("{0}/subtitles/{1}.es.vtt" -f $HostingBase.TrimEnd("/"), $id)
      source           = "gcs"
      updatedAt        = (Get-Date).ToUniversalTime().ToString("o")
    }
    Set-FirestoreVideo -Id $id -Fields $fields
  }
}

Write-Host ""
Write-Host "DONE"
Write-Host "Verify: curl.exe https://resumora.net/api/video/catalog"
Write-Host "Expect JSON source=firestore (after function has Firestore docs)."
Write-Host ""
Write-Host "If you also need Hosting captions/videos:"
Write-Host "  npm run build"
Write-Host "  firebase deploy --only hosting --project resumora-live"
Write-Host ""
Write-Host "Manual GCS upload example (env bucket name):"
Write-Host '  gcloud storage cp .\public\videos\vid-resume-writing-en.mp4 "gs://$env:GCS_BUCKET_NAME/masters/vid-resume-writing-en.mp4" --project=resumora-live'
