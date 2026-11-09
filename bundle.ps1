$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tpl = Get-Content -Raw "$root\src\template.html"
$coasters = Get-Content -Raw "$root\src\coasters.js"
$render = Get-Content -Raw "$root\src\render.js"
$park = Get-Content -Raw "$root\src\park.js"
$track = Get-Content -Raw "$root\src\track_builder.js"
$audio = Get-Content -Raw "$root\src\audio.js"
$ui = Get-Content -Raw "$root\src\ui.js"
$story = Get-Content -Raw "$root\src\story.js"

$tpl = $tpl.Replace('<script src="src/coasters.js"></script>', "<script>`n$coasters`n</script>")
$tpl = $tpl.Replace('<script src="src/render.js"></script>', "<script>`n$render`n</script>")
$tpl = $tpl.Replace('<script src="src/park.js"></script>', "<script>`n$park`n</script>")
$tpl = $tpl.Replace('<script src="src/track_builder.js"></script>', "<script>`n$track`n</script>")
$tpl = $tpl.Replace('<script src="src/audio.js"></script>', "<script>`n$audio`n</script>")
$tpl = $tpl.Replace('<script src="src/ui.js"></script>', "<script>`n$ui`n</script>")
$tpl = $tpl.Replace('<script src="src/story.js"></script>', "<script>`n$story`n</script>")

Set-Content -Path "$root\index.html" -Value $tpl -Encoding UTF8
Set-Content -Path "$root\cinderpine-express.html" -Value $tpl -Encoding UTF8
Write-Host "Bundled index.html and cinderpine-express.html successfully."
