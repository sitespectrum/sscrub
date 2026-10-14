namespace SscrubServer.Options;

public class DerivedStorageBucketOptions
{
    public const string SectionName = "DerivedStorageBucket";
    public string Endpoint { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string Bucket { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public string PublicUrl { get; set; } = string.Empty;
}