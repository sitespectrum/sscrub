using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

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
    [Required]
    public Guid Id { get; set; }
    [JsonIgnore]
    public string ObjectKey { get; set; } = string.Empty;
    public string? ThumbnailKey { get; set; }
    public FilmstripInfo? Filmstrip { get; set; }
    [Required]
    public string FileName { get; set; } = string.Empty;
    [Required]
    public long DurationMillis { get; set; }
    [Required]
    public long Size { get; set; }
    public string HeadHash { get; set; } = string.Empty;
    public DateTime? CaptureDate { get; set; }
    [Required]
    public DateTime UploadDate { get; set; }
    [Required]
    public Guid SinkId { get; set; }
    [Required]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public AssetStatus Status { get; set; }
    [Required]
    public string ContentType { get; set; } = string.Empty;
    [JsonIgnore]
    public string UploadId { get; set; } = string.Empty;

    [JsonIgnore]
    public virtual Sink Sink { get; set; } = null!;
}

[Owned]
public class FilmstripInfo
{
    [Required]
    public string ObjectKey { get; set; } = string.Empty;
    [Required]
    public int FrameCount { get; set; }
    [Required]
    public int Columns { get; set; }
    [Required]
    public int FrameWidth { get; set; }
    [Required]
    public int FrameHeight { get; set; }
    [Required]
    public long IntervalMillis { get; set; }
}