using System.Text.Json.Serialization;

namespace SscrubServer.Models;

public class Sink
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;

    [JsonIgnore]
    public virtual List<Asset> Assets { get; set; } = [];
}