export interface Video {
  id: string;
  title: string;
  publishedAt: string;
  channelTitle: string;
  channelId: string;
  hasBeenWatched: boolean;
  channelIdHumanReadable: string; // Add the new property
}

// Note: Initialization and loading of the API client will now happen in App.tsx, so these have been moved
// out of this file.
// Instead of creating an object to query, the specific query functions will be called directly, with
// the API key passed each time.

export async function fetchVideos(
  channelIdentifiers: string,
  perChannelQueryCount: number,
  apiKey: string
): Promise<Video[]> {
  const identifiers = channelIdentifiers.split(',');
  const allVideos: Video[] = [];

  for (const identifier of identifiers) {
    try {
      // 1. Determine if the identifier is a username or channel ID
      let channelId = identifier; // Assume it's a channel ID initially
      const channelIdHumanReadable = identifier; // Store the human-readable identifier
      if (!identifier.startsWith('UC') && !identifier.startsWith('UU')) {
        // Likely a username, fetch the channel ID
        console.log(`Fetching channel ID for username: ${identifier}`);
        channelId = await getChannelIdFromUsername(identifier, apiKey);
      }

      // 2. Get the uploads playlist ID
      const uploadsPlaylistId = await getUploadsPlaylistId(channelId, apiKey);

      // 3. Fetch videos from the uploads playlist
      const videos = await getVideosFromPlaylist(
        uploadsPlaylistId,
        perChannelQueryCount,
        apiKey
      );
      allVideos.push(...videos.map(video => ({ ...video, hasBeenWatched: false, channelIdHumanReadable }))); // Set hasBeenWatched to false and channelIdHumanReadable
    } catch (error) {
      console.error(`Error fetching videos for channel ${identifier}:`, error);
      // Handle errors as needed (e.g., skip the channel, retry, etc.)
    }
  }

  // 4. Sort all videos by publication date (descending)
  allVideos.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return allVideos;
}

async function getChannelIdFromUsername(
  username: string,
  apiKey: string
): Promise<string> {
    const response = await gapi.client.youtube.channels.list({
      part: 'id',
      // identifier options are: id, forHandle, forUsername
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
          videos.push({
            id: videoId,
            title,
            publishedAt,
            channelTitle,
            channelId,
            hasBeenWatched: false, // Set hasBeenWatched to false
            channelIdHumanReadable: '' // Initialize channelIdHumanReadable
          });
        }
      }
    }

    nextPageToken = playlistItemListResponse.nextPageToken || undefined;
    maxResults -= Math.min(maxResults, 50);
  } while (nextPageToken && maxResults > 0);

  return videos;
}