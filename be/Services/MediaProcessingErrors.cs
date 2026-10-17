using System.Collections.Concurrent;

namespace SscrubServer.Services;

public record MediaProcessingError(string Message, DateTime FailedAt);

/// <summary>
/// Last processing error per asset. In-memory only, so it is lost on restart.
/// </summary>
public class MediaProcessingErrors
{
    private readonly ConcurrentDictionary<Guid, MediaProcessingError> _errors = new();

    public void Set(Guid assetId, string message) =>
        _errors[assetId] = new MediaProcessingError(message, DateTime.UtcNow);

    public void Clear(Guid assetId) => _errors.TryRemove(assetId, out _);

    public MediaProcessingError? Get(Guid assetId) =>
        _errors.TryGetValue(assetId, out var error) ? error : null;
}
