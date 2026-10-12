namespace SscrubServer.Options;

public class AssetStorageBucketOptions
{
    public const string SectionName = "AssetStorageBucket";
    public string Endpoint {get;set;} = string.Empty;
    public string Region {get;set;} = string.Empty;
    public string Bucket {get;set;} = string.Empty;
    public string AccessKey {get;set;} = string.Empty;
    public string SecretKey {get;set;} = string.Empty;
}