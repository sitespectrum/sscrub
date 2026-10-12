namespace SscrubServer.Models;

public class Sink
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public virtual List<Asset> Assets { get; set; } = [];
}