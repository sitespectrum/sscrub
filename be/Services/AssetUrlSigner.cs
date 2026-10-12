using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using SscrubServer.Options;

namespace SscrubServer.Services;

public sealed class AssetUrlSigner(IOptions<AssetProxyOptions> options)
{
    private readonly string _baseUrl = options.Value.BaseUrl.TrimEnd('/');
    private readonly byte[] _secret = Encoding.UTF8.GetBytes(options.Value.UrlSigningSecret);
    private readonly long _lifetimeSeconds = options.Value.LifetimeSeconds;

    public string Sign(string objectKey)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var expires = (now / _lifetimeSeconds + 2) * _lifetimeSeconds;

        var path = "/" + objectKey.TrimStart('/');
        var signature = HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes($"{expires}\n{path}"));

        var encodedPath = string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

        return $"{_baseUrl}{encodedPath}?exp={expires}&sig={WebEncoders.Base64UrlEncode(signature)}";
    }
}
