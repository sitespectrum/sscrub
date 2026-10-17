using SscrubServer.Models;

namespace SscrubServer;

public record StartUploadBody(string FileName, Guid SinkId, string ContentType, long Size);
public record Part(int PartNumber, string ETag);
public record CompleteUploadBody(Part[] Parts);
public record CreateSinkBody(string Name, string Model, string Type, string Color);

public record ServerInfoResponse(string Name);
public record ErrorResponse(string Error);
public record StartUploadResponse(Guid Id, long PartSize, List<string> Urls);

public record LibraryStats(int Count, long Size, long DurationMillis);
public record SinkLibraryStats(Guid SinkId, int Count, long Size, long DurationMillis)
  : LibraryStats(Count, Size, DurationMillis);
public record LibraryStatsResponse(LibraryStats Overall, List<SinkLibraryStats> BySink);

public record AttentionItem(Asset Asset, string? Error, DateTime? FailedAt);
