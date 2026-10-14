namespace SscrubServer.Services;

public record FfprobeFormat(string FormatName, string? Duration, Dictionary<string, string>? Tags);
public record FfprobeStream(
    string CodecType,
    string? CodecName,
    string? Duration,
    Dictionary<string, int>? Disposition
);
public record FfprobeResult(FfprobeFormat Format, List<FfprobeStream>? Streams);