using System.Text.Json.Serialization;

namespace SscrubServer.Models;

public enum AssetStatus
{
    Uploading,
    Processing,
    Ready,
    Failed
}

public class Asset
{
    public Guid Id { get; set; }
    public string ObjectKey { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long DurationMillis { get; set; }
    public long Size { get; set; }
    public string HeadHash { get; set; } = string.Empty;
    public DateTime? CaptureDate { get; set; }
    public DateTime UploadDate { get; set; }
    public Guid SinkId { get; set; }
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public AssetStatus Status { get; set; }
    public string ContentType { get; set; } = string.Empty;
    [JsonIgnore]
    public string UploadId { get; set; } = string.Empty;

    [JsonIgnore]
    public virtual Sink Sink { get; set; } = null!;
}