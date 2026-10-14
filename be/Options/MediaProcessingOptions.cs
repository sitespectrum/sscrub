namespace SscrubServer.Options;

public class MediaProcessingOptions
{
  public const string SectionName = "MediaProcessing";
  public string FfmpegPath { get; set; } = "ffmpeg";
  public string FfprobePath { get; set; } = "ffprobe";
  public string WorkDir { get; set; } = "./data/processing";
  public int MaxConcurrency { get; set; } = 2;
  public long HeadHashBytes { get; set; } = 1 << 20;
  public int SeekConcurrency { get; set; } = 6;
}