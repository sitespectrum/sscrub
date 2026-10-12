namespace SscrubServer.Options;

public class AssetProxyOptions
{
    public const string SectionName = "AssetProxy";
    public string UrlSigningSecret { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public int LifetimeSeconds { get; set; }
}