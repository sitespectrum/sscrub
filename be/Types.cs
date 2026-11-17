using System.Text.Json.Serialization;
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

public record ProjectBody(string Name, DateTime Start, DateTime End, List<Guid> SinkIds);
public record ProjectFlagItem(Guid AssetId, ClipFlag Flag);
public record SetFlagBody(ClipFlag? Flag);
public record MarkerBody(DateTime Time, string Label, string Color);
public record ProjectResponse(
    Guid Id,
    string Name,
    DateTime Start,
    DateTime End,
    List<Guid> SinkIds,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<ProjectFlagItem> Flags,
    List<ProjectMarker> Markers);

/// <summary>Clips merged into one bar: touching or near-touching clips with the same status.</summary>
public record CoverageSpan(
    DateTime Start,
    DateTime End,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] AssetStatus Status);

/// <param name="Poster">The clip shown on the project card; null for audio sinks or sinks without clips.</param>
public record ProjectSinkSummary(Guid SinkId, Asset? Poster, List<CoverageSpan> Coverage);

/// <summary>What the project list needs, computed on the server so the client doesn't load the library.</summary>
/// <param name="Sinks">Track order; deleted sinks are dropped.</param>
public record ProjectSummary(
    Guid Id,
    string Name,
    DateTime Start,
    DateTime End,
    DateTime UpdatedAt,
    int ClipCount,
    int FlaggedCount,
    List<ProjectSinkSummary> Sinks);
