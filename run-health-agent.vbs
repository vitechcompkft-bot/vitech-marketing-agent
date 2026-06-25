' Vitech – health-agent rejtett (ablak nelkuli) inditasa az utemezett feladathoz.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Projects\vitech-marketing-agent"
sh.Run """C:\Program Files\nodejs\node.exe"" health-agent.js", 0, False
