using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace SscrubServer.Models;

public class Sink
{
    [Required]
    public Guid Id { get; set; }
    [Required]
    public string Name { get; set; } = string.Empty;
    [Required]
    public string Model { get; set; } = string.Empty;
    [Required]
    public string Type { get; set; } = string.Empty; // TODO(db): move types to db
    [Required]
    public string Color { get; set; } = string.Empty;

    [JsonIgnore]
    public virtual List<Asset> Assets { get; set; } = [];
}