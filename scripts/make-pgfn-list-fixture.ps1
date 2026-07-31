# Builds fixtures/pgfn/lista-manual.xlsx from the real PGFN Lista de Devedores
# export, replacing every identity with a synthetic one while preserving the
# structural patterns that the parser has to survive.
#
# Why Excel and not a generator: the point of this fixture is that the XML is
# genuinely Excel's. A hand-written workbook proves the reader can read what we
# wrote, which is not the question.
#
# The real file contains real people. This script opens it READ-ONLY, never
# saves over it, never prints a cell, and writes only the sanitized copy.
# The real file stays gitignored and out of the repository.
#
#   powershell -File scripts/make-pgfn-list-fixture.ps1 -Source "<path to real xlsx>"

param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Destination
)

$ErrorActionPreference = 'Stop'

# Resolved here, not in the param default: $PSScriptRoot is not reliably bound
# at parameter-binding time, and the first run silently wrote to C:\fixtures.
if (-not $Destination) {
  $Destination = Join-Path $PSScriptRoot '..\fixtures\pgfn\lista-manual.xlsx'
}

if (-not (Test-Path $Source)) { throw "source not found: $Source" }
$destinationDirectory = Split-Path -Parent $Destination
if (-not (Test-Path $destinationDirectory)) {
  New-Item -ItemType Directory -Force $destinationDirectory | Out-Null
}
$Destination = [System.IO.Path]::GetFullPath($Destination)
if ([System.IO.Path]::GetFullPath($Source) -eq $Destination) {
  throw "refusing to write over the source file"
}

# Synthetic names that reproduce the token-match patterns the real search
# returns: the query term scattered across positions, out of order, absorbed
# into a longer name, and split across a surname ("SANT ANA" for "ANA").
$names = @(
  'JOSE SANTOS',
  'JOSE DA SILVA SANTOS',
  'MARIA JOSE ALVES PEREIRA SOARES SANTOS',
  'SANTOS JOSE PEREIRA',
  'ROGERIO SANT ANA DA SILVA',
  'ANTONIO JOSE DOS SANTOS NETO',
  'JOSE SANTOS',
  'CARLA SANTOS JOSE',
  'JOSE CARLOS SANTOS JUNIOR',
  'BENEDITO JOSE SANTOS'
)

# Masks: mostly distinct, with a deliberate repeat so two different people
# share one mask, which is the case the resolver must not treat as identity.
$masks = @(
  '***.982.247-**',
  '***.111.222-**',
  '***.982.247-**',
  '***.333.444-**',
  '***.555.666-**',
  '***.777.888-**',
  '***.982.247-**',
  '***.999.000-**',
  '***.121.314-**',
  '***.151.617-**'
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
  $workbook = $excel.Workbooks.Open($Source, [Type]::Missing, $true)
  $sheet = $workbook.Worksheets.Item(1)
  $used = $sheet.UsedRange
  $lastRow = $used.Row + $used.Rows.Count - 1

  # Preamble filter values are a search term, not a person, but they must match
  # the synthetic names or the fixture would describe a query it did not run.
  for ($row = 1; $row -le 12; $row++) {
    $value = [string]$sheet.Cells.Item($row, 1).Value2
    if ($value -match '^\s*Nome\s*:') {
      $sheet.Cells.Item($row, 1).Value2 = 'Nome: Jose Santos'
    }
    elseif ($value -match '^\s*Data da pesquisa') {
      $sheet.Cells.Item($row, 1).Value2 = 'Data da pesquisa: 27/07/2026 14:53'
    }
  }

  # Header sits at row 13 in the real export; find it rather than assume.
  $headerRow = 0
  for ($row = 1; $row -le 30; $row++) {
    if ([string]$sheet.Cells.Item($row, 1).Value2 -match 'CPF') { $headerRow = $row; break }
  }
  if ($headerRow -eq 0) { throw 'header row not found' }

  $index = 0
  for ($row = $headerRow + 1; $row -le $lastRow; $row++) {
    $cpfCell = $sheet.Cells.Item($row, 1)
    if ([string]::IsNullOrWhiteSpace([string]$cpfCell.Value2)) { continue }

    # Overwrite without ever reading the identity into a variable we print.
    $cpfCell.Value2 = $masks[$index % $masks.Count]
    $sheet.Cells.Item($row, 2).Value2 = $names[$index % $names.Count]
    $index++
  }

  # A second block appended with no preamble and no header of its own: the real
  # export concatenates distinct queries this way, and a block without
  # provenance has to be marked or refused rather than silently merged.
  #
  # Separated by three empty rows, not one. In the real export Excel omits a
  # single empty row (row 60) from the XML in the middle of the data, so a
  # one-row gap is formatting and cannot mark a boundary.
  $orphanStart = $lastRow + 4
  $orphan = @(
    @('***.222.333-**', 'JOSE SANTOS', '', '4.100,00', '4.100,00'),
    @('***.444.555-**', 'MARIANA JOSE SANTOS CRUZ', '', '12.345,678901234', '9.000,00')
  )
  for ($i = 0; $i -lt $orphan.Count; $i++) {
    for ($column = 1; $column -le 5; $column++) {
      $sheet.Cells.Item($orphanStart + $i, $column).Value2 = $orphan[$i][$column - 1]
    }
  }

  # Excel refuses SaveAs straight into the OneDrive-synced working copy, so it
  # writes to a temp path and the file is copied in afterwards.
  $staging = Join-Path $env:TEMP ("pgfn-lista-fixture-{0}.xlsx" -f [guid]::NewGuid())
  # 51 = xlOpenXMLWorkbook (.xlsx)
  $workbook.SaveAs($staging, 51)
  $workbook.Close($false)
  $workbook = $null
  Copy-Item $staging $Destination -Force
  Remove-Item $staging -Force
  Write-Output "wrote $Destination"
  Write-Output "sanitized data rows: $index"
}
finally {
  if ($workbook) { $workbook.Close($false) }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
