namespace SscrubServer;

public record StartUploadBody(string FileName, Guid SinkId, string ContentType, long Size);
public record Part(int PartNumber, string ETag);
public record CompleteUploadBody(Part[] Parts);
public record CreateSinkBody(string Name);

public record ServerInfoResponse(string Name);
public record ErrorResponse(string Error);
public record StartUploadResponse(Guid Id, long PartSize, List<string> Urls);
