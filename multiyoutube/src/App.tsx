import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchVideos, Video } from './youtube';

interface VideoWithWatched extends Video {
  hasBeenWatched: boolean;
}

function App() {
  const [videos, setVideos] = useState<VideoWithWatched[]>(() => {
    const savedVideos = localStorage.getItem('videos');
    return savedVideos ? JSON.parse(savedVideos) : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelIdentifiers, setChannelIdentifiers] = useState<string>(() => {
    return localStorage.getItem('channelIdentifiers') || 'CosmicPumpkin,DrGeoffLindsey,HGModernism,LamoGaming,LatteASMR,PracticalEngineeringChannel,ShortCircuit,WilliamOsman2,cherry_official,littlechineseeverywhere,scottmanley,zefrank';
  });
  const [inputValue, setInputValue] = useState<string>(channelIdentifiers);
  const [viewMode, setViewMode] = useState<string>(() => {
    return localStorage.getItem('viewMode') || 'list';
  });
  const [lastAPICall, setLastAPICall] = useState<number>(() => {
    return parseInt(localStorage.getItem('lastAPICall') || '0', 10);
  });
  const [perChannelQueryCount, setPerChannelQueryCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('perChannelQueryCount') || '3', 10);
  });

  const apiKey = 'AIzaSyAm9PqXUWUL7r-uEWL0OAmnZ3kL8oFyV0M';

  useEffect(() => {
    const initializeGapi = () => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              apiKey: apiKey,
              discoveryDocs: [
                'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
              ],
            });
            fetchData();
          } catch (error) {
            console.error('Error initializing gapi client:', error);
          }
        });
      };
      script.onerror = () => {
        console.error('Error loading gapi script');
      };
      document.body.appendChild(script);
    };

    const fetchData = async () => {
      const now = Date.now();
      const volumeScalar = Math.floor(perChannelQueryCount / 10) + 1 * channelIdentifiers.split(',').length;
      const cullTimer = volumeScalar * 10 * 60 * 1000;
      console.log('Volume scalar is', volumeScalar, 'with an API hit timer of', cullTimer / 60000, 'minutes');
      if (now - lastAPICall < cullTimer) {
        console.log('Using cached data:', videos.length, 'videos in localStorage');
        console.log('Next API hit in', Math.round((cullTimer - (now - lastAPICall)) / 60000), 'minutes');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        if (!window.gapi.client.youtube) {
          await new Promise<void>((resolve, reject) => {
            window.gapi.client.load('youtube', 'v3').then(() => {
              resolve();
            }).catch((error) => {
              reject(error);
            });
          });
        }
        const fetchedVideos = await fetchVideos(
          channelIdentifiers,
          perChannelQueryCount,
          apiKey
        );
        const fetchedVideosWithWatched = fetchedVideos.map(video => ({
          ...video,
          hasBeenWatched: false,
        }));
        console.log('Previous videos:', videos);
        console.log('Fetched videos:', fetchedVideosWithWatched);
        setVideos((prevVideos) => {
          // concat arrays and deduplicate by video ID
          const mergedVideos = [...prevVideos, ...fetchedVideosWithWatched];
          const uniqueVideosMap = new Map<string, VideoWithWatched>();
          /*mergedVideos.forEach(video => {
            uniqueVideosMap.set(video.id, video);
          });*/
          mergedVideos.forEach(video => {
            if (uniqueVideosMap.has(video.id)) {
              // use found videos with hasBeenWatched=1 to update existing videos
              const existingVideo = uniqueVideosMap.get(video.id);
              if (existingVideo && video.hasBeenWatched) {
                existingVideo.hasBeenWatched = true;
              }
            } else {
              uniqueVideosMap.set(video.id, video);
            }
          });
          // sort by publication date (descending)
          const uniqueVideos = Array.from(uniqueVideosMap.values())
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
          console.log('Merged videos:', mergedVideos);
          return uniqueVideos;
        });
        setLastAPICall(now);
        localStorage.setItem('lastAPICall', now.toString());
      } catch (err) {
        console.error('Error fetching videos:', err);
        setError('Error fetching videos');
      } finally {
        setLoading(false);
      }
    };

    initializeGapi();
  }, [channelIdentifiers, lastAPICall, videos, perChannelQueryCount]);

  // Handle channel identifier changes (now extracts value from event)
  const handleChannelIdentifiersChange = useCallback((newValue: string) => {
    const newIdentifiers = newValue;
    const sortedIdentifiers = newIdentifiers
      .split(',')
      .map((id) => id.trim())
      .sort()
      .join(',');
    setChannelIdentifiers(sortedIdentifiers);
    localStorage.setItem('channelIdentifiers', sortedIdentifiers);
    
    // forces another API hit if channel identifiers change
    // TODO: ideally only the delta (new channels) should be fetched
    if (sortedIdentifiers !== channelIdentifiers) {
      console.log('Channel identifiers changed, resetting API call timer');
      resetAPITimer();
    }
  }, [channelIdentifiers]); // Dependencies are correctly tracked now

  // define resetAPITimer function
  const resetAPITimer = () => {
    setLastAPICall(0);
    localStorage.setItem('lastAPICall', '0');
  };

  // Use useRef to keep track of the timeout
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Handle input value changes (IMMEDIATE)
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue); // Update input value immediately

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      handleChannelIdentifiersChange(newValue); // Update channelIdentifiers after delay
    }, 2000);
  }, [handleChannelIdentifiersChange]);

  // setInputValue when channelIdentifiers changes
  useEffect(() => {
    setInputValue(channelIdentifiers);
  }, [channelIdentifiers]);

  // Save videos to localStorage and cull old videos
  useEffect(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const culledVideos = videos.filter(video => new Date(video.publishedAt) > threeMonthsAgo);
    console.log("Culling", videos.length - culledVideos.length, "videos older than 3 months");
    localStorage.setItem('videos', JSON.stringify(culledVideos));
  }, [videos]);

  const handleViewModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newViewMode = event.target.value;
    setViewMode(newViewMode);
    localStorage.setItem('viewMode', newViewMode);
  };

  const handlePerChannelQueryCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(event.target.value, 10);
    // check newCount is a number and is between 1 and 50
    if (isNaN(newCount) || newCount < 1 || newCount > 50) {
      return;
    }

    setPerChannelQueryCount(newCount);
    localStorage.setItem('perChannelQueryCount', newCount.toString());
  };

  const handleWatchedChange = (videoId: string) => {
    setVideos((prevVideos) =>
      prevVideos.map((video) =>
        video.id === videoId
          ? { ...video, hasBeenWatched: !video.hasBeenWatched }
          : video
      )
    );
  };

  return (
    <main>
      <h1>MultiYT</h1>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Enter channel identifiers"
      />
      <div className="view-selector">
        <label>
          <input
            type="radio"
            value="list"
            checked={viewMode === 'list'}
            onChange={handleViewModeChange}
          />
          List View
        </label>
        <label>
          <input
            type="radio"
            value="tiled"
            checked={viewMode === 'tiled'}
            onChange={handleViewModeChange}
          />
          Tiled View
        </label>
      </div>
      <div>
        <label>
          Videos per Channel:
          <input
            type="number"
            value={perChannelQueryCount}
            onChange={handlePerChannelQueryCountChange}
            min="1"
            max="50"
          />
        </label>
      </div>
      <button onClick={resetAPITimer}>Refresh</button>
      {loading && <p>Loading videos...</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && (
        <div className={viewMode === 'list' ? 'list-view' : 'tiled-view'}>
          {viewMode === 'list' ? (
            <ul>
              {videos.map((video) => (
                <li key={video.id} className={video.hasBeenWatched ? 'checked' : ''}>
                  <span>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {video.title}
                    </a>{' '}
                     - {video.channelTitle} - {' '}
                    {new Date(video.publishedAt).toLocaleDateString('en-GB')}
                  </span>
                  <input
                    type="checkbox"
                    checked={video.hasBeenWatched}
                    onChange={() => handleWatchedChange(video.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="video-grid">
              {videos.map((video) => (
                <div key={video.id} className="video-tile">
                  <iframe
                    width="240"
                    height="155"
                    src={`https://www.youtube.com/embed/${video.id}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                  <p>{video.title} (from {video.channelTitle})</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default App;