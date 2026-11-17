using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace SscrubServer.Models;

/// <summary>A set of sinks over a time window, culled as a multicam timeline.</summary>
public class Project
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    /// <summary>Track order. Not a foreign key: ids of deleted sinks are dropped on read.</summary>
    public List<Guid> SinkIds { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public virtual List<ProjectFlag> Flags { get; set; } = [];
    public virtual List<ProjectMarker> Markers { get; set; } = [];
}

[JsonConverter(typeof(JsonStringEnumConverter<ClipFlag>))]
public enum ClipFlag
{
    Pick,
    Reject
}

/// <summary>A pick/reject decision on one asset within one project.</summary>
public class ProjectFlag
{
    public Guid ProjectId { get; set; }
    public Guid AssetId { get; set; }
    public ClipFlag Flag { get; set; }

    public virtual Project Project { get; set; } = null!;
    public virtual Asset Asset { get; set; } = null!;
}

public class ProjectMarker
{
    [Required]
    public Guid Id { get; set; }
    [JsonIgnore]
    public Guid ProjectId { get; set; }
    [Required]
    public DateTime Time { get; set; }
    [Required]
    public string Label { get; set; } = string.Empty;
    [Required]
    public string Color { get; set; } = string.Empty;

    [JsonIgnore]
    public virtual Project Project { get; set; } = null!;
}
