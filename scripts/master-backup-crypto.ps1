#Requires -Version 5.1
<#
.SYNOPSIS
  AES-256 helpers for System Master Backup. Never prints passwords or secret contents.

.DESCRIPTION
  Public API:
    Export-Crypto -FilePath -OutputPath -Password
    Import-Crypto -FilePath -OutputPath -Password

  Also provides Protect-MasterBackupFile / Unprotect-MasterBackupFile used by
  export-master-backup.ps1 and import-master-backup.ps1.
#>

$script:MasterBackupMagic = [byte[]](0x52, 0x53, 0x4D, 0x42, 0x01, 0x00, 0x00, 0x00) # 'RSMB' v1
$script:Pbkdf2Iterations = 200000

function ConvertFrom-SecureStringToUtf8Bytes {
  param([Parameter(Mandatory = $true)][SecureString]$Secure)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrEmpty($plain)) {
      return [byte[]]@()
    }
    return [Text.Encoding]::UTF8.GetBytes($plain)
  }
  finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $plain = $null
  }
}

function ConvertTo-MasterBackupSecurePassword {
  param([Parameter(Mandatory = $true)]$Password)
  if ($Password -is [SecureString]) {
    return $Password
  }
  if ($Password -is [string]) {
    return ConvertTo-SecureString -String $Password -AsPlainText -Force
  }
  throw 'Password must be a SecureString or string.'
}

function Test-SecureStringEqual {
  param(
    [Parameter(Mandatory = $true)][SecureString]$A,
    [Parameter(Mandatory = $true)][SecureString]$B
  )
  $ba = $null
  $bb = $null
  try {
    $ba = ConvertFrom-SecureStringToUtf8Bytes -Secure $A
    $bb = ConvertFrom-SecureStringToUtf8Bytes -Secure $B
    if ($ba.Length -ne $bb.Length) { return $false }
    $diff = 0
    for ($i = 0; $i -lt $ba.Length; $i++) {
      $diff = $diff -bor ($ba[$i] -bxor $bb[$i])
    }
    return ($diff -eq 0)
  }
  finally {
    if ($ba) { [Array]::Clear($ba, 0, $ba.Length) }
    if ($bb) { [Array]::Clear($bb, 0, $bb.Length) }
  }
}

function Test-PasswordStrengthBytes {
  param([byte[]]$PasswordBytes)
  if ($PasswordBytes.Length -lt 16) {
    return @{ Ok = $false; Reason = 'Password must be at least 16 characters.' }
  }
  $text = [Text.Encoding]::UTF8.GetString($PasswordBytes)
  $hasUpper = $text -cmatch '[A-Z]'
  $hasLower = $text -cmatch '[a-z]'
  $hasDigit = $text -cmatch '[0-9]'
  $hasOther = $text -cmatch '[^A-Za-z0-9]'
  $text = $null
  if (-not ($hasUpper -and $hasLower -and $hasDigit -and $hasOther)) {
    return @{ Ok = $false; Reason = 'Password must include upper, lower, digit, and symbol.' }
  }
  return @{ Ok = $true; Reason = '' }
}

function Protect-MasterBackupFile {
  param(
    [Parameter(Mandatory = $true)][string]$PlainPath,
    [Parameter(Mandatory = $true)][string]$OutPath,
    [Parameter(Mandatory = $true)][byte[]]$PasswordBytes
  )
  $salt = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($salt)
  $derive = New-Object Security.Cryptography.Rfc2898DeriveBytes(
    $PasswordBytes,
    $salt,
    $script:Pbkdf2Iterations,
    [Security.Cryptography.HashAlgorithmName]::SHA256
  )
  $aes = $null
  $fsIn = $null
  $fsOut = $null
  $crypto = $null
  $key = $null
  try {
    $key = $derive.GetBytes(32)
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $key
    $aes.GenerateIV()
    $outDir = Split-Path -Parent $OutPath
    if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $fsOut = [IO.File]::Open($OutPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    $fsOut.Write($script:MasterBackupMagic, 0, $script:MasterBackupMagic.Length)
    $fsOut.Write($salt, 0, $salt.Length)
    $fsOut.Write($aes.IV, 0, $aes.IV.Length)
    $encryptor = $aes.CreateEncryptor()
    $crypto = New-Object Security.Cryptography.CryptoStream($fsOut, $encryptor, [Security.Cryptography.CryptoStreamMode]::Write)
    $fsIn = [IO.File]::OpenRead($PlainPath)
    $fsIn.CopyTo($crypto)
    $crypto.FlushFinalBlock()
  }
  finally {
    if ($crypto) { $crypto.Dispose() }
    if ($fsIn) { $fsIn.Dispose() }
    if ($fsOut) { $fsOut.Dispose() }
    if ($aes) { $aes.Dispose() }
    if ($derive) { $derive.Dispose() }
    if ($key) { [Array]::Clear($key, 0, $key.Length) }
    if ($salt) { [Array]::Clear($salt, 0, $salt.Length) }
  }
}

function Unprotect-MasterBackupFile {
  param(
    [Parameter(Mandatory = $true)][string]$EncPath,
    [Parameter(Mandatory = $true)][string]$OutPath,
    [Parameter(Mandatory = $true)][byte[]]$PasswordBytes
  )
  $fsIn = $null
  $fsOut = $null
  $crypto = $null
  $aes = $null
  $derive = $null
  $key = $null
  $salt = $null
  $iv = $null
  try {
    $fsIn = [IO.File]::OpenRead($EncPath)
    $magic = New-Object byte[] 8
    if ($fsIn.Read($magic, 0, 8) -ne 8) { throw 'Encrypted backup is truncated or invalid.' }
    for ($i = 0; $i -lt 8; $i++) {
      if ($magic[$i] -ne $script:MasterBackupMagic[$i]) {
        throw 'Not a Resumora System Master Backup (.enc) file.'
      }
    }
    $salt = New-Object byte[] 16
    $iv = New-Object byte[] 16
    if ($fsIn.Read($salt, 0, 16) -ne 16) { throw 'Encrypted backup header is incomplete.' }
    if ($fsIn.Read($iv, 0, 16) -ne 16) { throw 'Encrypted backup header is incomplete.' }
    $derive = New-Object Security.Cryptography.Rfc2898DeriveBytes(
      $PasswordBytes,
      $salt,
      $script:Pbkdf2Iterations,
      [Security.Cryptography.HashAlgorithmName]::SHA256
    )
    $key = $derive.GetBytes(32)
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $key
    $aes.IV = $iv
    $decryptor = $aes.CreateDecryptor()
    $crypto = New-Object Security.Cryptography.CryptoStream($fsIn, $decryptor, [Security.Cryptography.CryptoStreamMode]::Read)
    $outDir = Split-Path -Parent $OutPath
    if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $fsOut = [IO.File]::Open($OutPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    $crypto.CopyTo($fsOut)
  }
  catch {
    if (Test-Path -LiteralPath $OutPath) {
      Remove-Item -LiteralPath $OutPath -Force -ErrorAction SilentlyContinue
    }
    throw 'Decryption failed. Wrong password or corrupted file.'
  }
  finally {
    if ($crypto) { $crypto.Dispose() }
    if ($fsOut) { $fsOut.Dispose() }
    if ($fsIn) { $fsIn.Dispose() }
    if ($aes) { $aes.Dispose() }
    if ($derive) { $derive.Dispose() }
    if ($key) { [Array]::Clear($key, 0, $key.Length) }
    if ($salt) { [Array]::Clear($salt, 0, $salt.Length) }
    if ($iv) { [Array]::Clear($iv, 0, $iv.Length) }
  }
}

function Remove-PathSecure {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
  try {
    if ((Get-Item -LiteralPath $Path).PSIsContainer) {
      Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
        ForEach-Object {
          if (-not $_.PSIsContainer) {
            try { [IO.File]::WriteAllBytes($_.FullName, [byte[]]@()) } catch { }
          }
        }
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    }
    else {
      try { [IO.File]::WriteAllBytes($Path, [byte[]]@()) } catch { }
      Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
  }
  catch { }
}

function Export-Crypto {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)]$Password
  )
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw "Source file not found: $FilePath"
  }
  $secure = ConvertTo-MasterBackupSecurePassword -Password $Password
  $bytes = $null
  try {
    $bytes = ConvertFrom-SecureStringToUtf8Bytes -Secure $secure
    Protect-MasterBackupFile -PlainPath $FilePath -OutPath $OutputPath -PasswordBytes $bytes
    Write-Host '[master-backup-crypto] OK file encrypted' -ForegroundColor Green
  }
  finally {
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  }
}

function Import-Crypto {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)]$Password
  )
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw "Encrypted file not found: $FilePath"
  }
  $secure = ConvertTo-MasterBackupSecurePassword -Password $Password
  $bytes = $null
  try {
    $bytes = ConvertFrom-SecureStringToUtf8Bytes -Secure $secure
    Unprotect-MasterBackupFile -EncPath $FilePath -OutPath $OutputPath -PasswordBytes $bytes
    Write-Host '[master-backup-crypto] OK file decrypted' -ForegroundColor Green
  }
  finally {
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  }
}
