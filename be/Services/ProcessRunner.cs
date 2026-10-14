using System.Diagnostics;
using System.IO.Pipes;

namespace SscrubServer.Services;

public static class ProcessRunner
{
    public static async Task<string> RunAsync(string executable, IEnumerable<string> args, CancellationToken ct)
    {
        var processStartInfo = new ProcessStartInfo(executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        foreach (var arg in args)
        {
            processStartInfo.ArgumentList.Add(arg);
        }

        using var process = Process.Start(processStartInfo)
            ?? throw new InvalidOperationException($"Failed to start process: {executable}");

        var stdout = process.StandardOutput.ReadToEndAsync(ct);
        var stderr = process.StandardError.ReadToEndAsync(ct);

        try
        {
            await process.WaitForExitAsync(ct);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw;
        }

        if (process.ExitCode != 0)
        {
            var err = await stderr;
            throw new InvalidOperationException(
                $"{executable} exited with code {process.ExitCode}: {err[^Math.Min(err.Length, 1000)..]}"
            );
        }

        return await stdout;
    }
}