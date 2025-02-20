export interface Video {
  id: string;
  title: string;
  publishedAt: string;
  channelTitle: string;
  channelId: string;
  hasBeenWatched: boolean;
  channelIdHumanReadable: string;
  duration: string;
  isShort: boolean;
}

export interface Channel {
  humanReadable: string;
  channelId: string;
  uploadsPlaylistId: string;
}

export interface FetchResult {
  videos: Video[];
  channels: Channel[];
}

export async function fetchVideosAndUpdateChannels(
  channels: Channel[],
  perChannelQueryCount: number,
  apiKey: string
): Promise<FetchResult> {
  const allVideos: Video[] = [];
  
  for (const channel of channels) {
    try {
      let { channelId, uploadsPlaylistId } = channel;

      if (!channelId) {
        console.log(`Fetching channel ID for ${channel.humanReadable}`);
        channelId = await getChannelIdFromUsername(channel.humanReadable, apiKey);
        // not pointless, we pass the channels object back to the caller
        channel.channelId = channelId;
      }

      if (!uploadsPlaylistId) {
        console.log(`Fetching uploads playlist ID for ${channel.humanReadable}`);
        uploadsPlaylistId = await getUploadsPlaylistId(channelId, apiKey);
        channel.uploadsPlaylistId = uploadsPlaylistId;
      }

      console.log(`Fetching videos for ${channel.humanReadable}`);
      const videos = await getVideosFromPlaylist(
        uploadsPlaylistId,
        perChannelQueryCount,
        apiKey
      );
      allVideos.push(...videos.map(video => ({ ...video, hasBeenWatched: false, channelIdHumanReadable: channel.humanReadable })));
    } catch (error) {
      console.error(`Error fetching videos for channel ${channel.humanReadable}:`, error);
    }
  }

  allVideos.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  
  return { videos: allVideos, channels: channels };
}

async function getChannelIdFromUsername(
  username: string,
  apiKey: string
): Promise<string> {
  const response = await gapi.client.youtube.channels.list({
    part: 'id',
    forHandle: username,
    key: apiKey,
  });

  const channel = response.result.items?.[0];
  if (!channel) {
    throw new Error(`Channel not found for username: ${username}`);
  }
  return channel.id!;
}

async function getUploadsPlaylistId(
  channelId: string,
  apiKey: string
): Promise<string> {
  const response = await gapi.client.youtube.channels.list({
    part: 'contentDetails',
    id: channelId,
    key: apiKey,
  });

  const channel = response.result.items?.[0];
  if (!channel) {
    throw new Error(`Channel not found for ID: ${channelId}`);
  }
  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error(`Uploads playlist not found for channel: ${channelId}`);
  }
  return uploadsPlaylistId;
}

interface PlaylistItem {
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelTitle?: string;
    channelId?: string;
  };
  contentDetails?: {
    videoId?: string;
  };
}

interface PlaylistItemListResponse {
  items?: PlaylistItem[];
  nextPageToken?: string;
}

async function getVideosFromPlaylist(
  playlistId: string,
  maxResults: number,
  apiKey: string
): Promise<Video[]> {
  const videos: Video[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const response: gapi.client.Response<PlaylistItemListResponse> = await gapi.client.youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: playlistId,
      maxResults: Math.min(maxResults, 50),
      pageToken: nextPageToken,
      key: apiKey,
    });

    const playlistItemListResponse: PlaylistItemListResponse = response.result;

    const items = playlistItemListResponse.items;
    if (items) {
      for (const item of items) {
        const videoId = item.contentDetails?.videoId;
        const title = item.snippet?.title;
        const publishedAt = item.snippet?.publishedAt;
        const channelTitle = item.snippet?.channelTitle;
        const channelId = item.snippet?.channelId;

        if (videoId && title && publishedAt && channelTitle && channelId) {
          const videoDetailsResponse = await gapi.client.youtube.videos.list({
            part: 'contentDetails',
            id: videoId,
            key: apiKey,
          });

          const videoDetails = videoDetailsResponse.result.items?.[0]?.contentDetails;
          const duration = videoDetails?.duration || '';
          const isShort = parseDuration(duration) <= 62;

          videos.push({
            id: videoId,
            title,
            publishedAt,
            channelTitle,
            channelId,
            hasBeenWatched: false,
            channelIdHumanReadable: '',
            duration,
            isShort,
          });
        }
      }
    }

    nextPageToken = playlistItemListResponse.nextPageToken || undefined;
    maxResults -= Math.min(maxResults, 50);
  } while (nextPageToken && maxResults > 0);

  return videos;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}