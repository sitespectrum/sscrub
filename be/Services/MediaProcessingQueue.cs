using System.Threading.Channels;

namespace SscrubServer.Services;

public class MediaProcessingQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();

    public ValueTask EnqueueAsync(Guid assetId, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(assetId, ct);

    public IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}