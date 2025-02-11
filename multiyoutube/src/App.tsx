import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchVideos, Video } from './youtube';
//import { channel } from 'diagnostics_channel';

interface VideoWithWatched extends Video {
  hasBeenWatched: boolean;
  channelIdHumanReadable: string; // Add the new property
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
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [newChannel, setNewChannel] = useState<string | null>(null);
  //const [inputValue, setInputValue] = useState<string>(channelIdentifiers);
  const [viewMode, setViewMode] = useState<string>(() => {
    return localStorage.getItem('viewMode') || 'list';
  });
  const [lastAPICall, setLastAPICall] = useState<number>(() => {
    return parseInt(localStorage.getItem('lastAPICall') || '0', 10);
  });
  const [perChannelQueryCount, setPerChannelQueryCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('perChannelQueryCount') || '3', 10);
  });
  const [historyMonths, setHistoryMonths] = useState<number>(() => {
    return parseInt(localStorage.getItem('historyMonths') || '3', 10);
  });
  const [currentPage, setCurrentPage] = useState<number>(() => {
    return parseInt(localStorage.getItem('currentPage') || '1', 10);
  });
  const itemsPerPageThumbs = 12;
  const itemsPerPageEmbeds = 4;

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
      if (!isAddingChannel && now - lastAPICall < cullTimer) {
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
        const toFetch = isAddingChannel ? newChannel! : channelIdentifiers;

        if (isAddingChannel && newChannel) {
          const updatedIdentifiers = (channelIdentifiers + ',' + newChannel)
            .split(',')
            .map(id => id.trim())
            .filter((id, index, self) => self.indexOf(id) === index)
            .sort()
            .join(',');
          
          setChannelIdentifiers(updatedIdentifiers);
          localStorage.setItem('channelIdentifiers', updatedIdentifiers);
          setIsAddingChannel(false);
          setNewChannel(null);
        } else {
          // we want loading a single channel to not reset the timer, so this is only done here
          setLastAPICall(now);
          localStorage.setItem('lastAPICall', now.toString());
        }

        const fetchedVideos = await fetchVideos(
          toFetch,
          perChannelQueryCount,
          apiKey
        );
        const fetchedVideosWithWatched = fetchedVideos.map(video => ({
          ...video,
          hasBeenWatched: false,
          channelIdHumanReadable: video.channelIdHumanReadable // Set channelIdHumanReadable
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
          return cullOldVideos(uniqueVideos);
        });
      } catch (err) {
        console.error('Error fetching videos:', err);
        setError('Error fetching videos');
      } finally {
        setLoading(false);
      }
    };

    initializeGapi();
  }, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lastAPICall, videos, perChannelQueryCount, newChannel, isAddingChannel, historyMonths]); // channelIdentifiers omitted

  // Handle channel identifier changes (now extracts value from event)
  const handleAddChannel = (newChannel: string) => {
    if (!newChannel) return;

    inputRef.current!.value = '';
  
    setIsAddingChannel(true);
    setNewChannel(newChannel);
  };

  // define resetAPITimer function
  const resetAPITimer = () => {
    setLastAPICall(0);
    localStorage.setItem('lastAPICall', '0');
  };

  const cullOldVideos = useCallback((videos: VideoWithWatched[]) => {
    const dateInPast = new Date();
    dateInPast.setMonth(dateInPast.getMonth() - historyMonths);
    const culledVideos = videos.filter(video => new Date(video.publishedAt) > dateInPast);
    console.log("Culling", videos.length - culledVideos.length, "videos older than", historyMonths, "months");
    return culledVideos;
  }, [historyMonths])

  // Save videos to localStorage and cull old videos
  useEffect(() => {
    localStorage.setItem('videos', JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    setVideos(prevVideos => {
      const culledVideos = cullOldVideos(prevVideos);
      localStorage.setItem('videos', JSON.stringify(culledVideos));
      return culledVideos;
    });
  }, [historyMonths, cullOldVideos]);

  const handleViewModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newViewMode = event.target.value;
    setViewMode(newViewMode);
    localStorage.setItem('viewMode', newViewMode);
    setCurrentPage(1);
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

  const handleHistoryMonthsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newHistoryMonths = parseInt(event.target.value, 10);
    // check newHistoryMonths is a number and is between 1 and 12
    if (isNaN(newHistoryMonths) || newHistoryMonths < 1 || newHistoryMonths > 9) {
      return;
    }

    setHistoryMonths(newHistoryMonths);
    localStorage.setItem('historyMonths', newHistoryMonths.toString());
  };

  const handleWatchedChange = (videoId: string) => {
    console.log('Toggling watched status for video', videoId);
    setVideos((prevVideos) =>
      prevVideos.map((video) =>
        video.id === videoId
          ? { ...video, hasBeenWatched: !video.hasBeenWatched }
          : video
      )
    );
  };

  const handleRemoveChannel = (channel: string) => {
    const newIdentifiers = channelIdentifiers
      .split(',')
      .filter((id) => id.trim() !== channel)
      .join(',');
    setChannelIdentifiers(newIdentifiers);
    localStorage.setItem('channelIdentifiers', newIdentifiers);
    
    // remove videos created by said channel from state
    setVideos((prevVideos) => prevVideos.filter(video => video.channelIdHumanReadable !== channel));
  };

  const resetVideos = () => {
    setVideos([]);
    localStorage.removeItem('videos');
  }

  const inputRef = useRef<HTMLInputElement>(null);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    localStorage.setItem('currentPage', newPage.toString());
  };

  const paginatedVideos = viewMode === 'thumbnails'
    ? videos.slice((currentPage - 1) * itemsPerPageThumbs, currentPage * itemsPerPageThumbs)
    : videos.slice((currentPage - 1) * itemsPerPageEmbeds, currentPage * itemsPerPageEmbeds);

  return (
    <main>
      <h1>MultiYT</h1>
      <div className="channel-list">
        {channelIdentifiers.split(',').map((channel) => (
          <span key={channel} className="channel-item">
            {channel}
            <button onClick={() => handleRemoveChannel(channel)}>x</button>
          </span>
        ))}
      </div>
      <div className="channel-controls">
        <div>
          <input
            type="text"
            placeholder="Enter new channel"
            ref={inputRef}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAddChannel(inputRef.current?.value || '');
              }
            }}
          />
          <button onClick={() => handleAddChannel(inputRef.current?.value || '')}>Add channel</button>
        </div>
        <div>
          <label>
            <input
              type="radio"
              value="list"
              checked={viewMode === 'list'}
              onChange={handleViewModeChange}
            />
            List
          </label>
          <label>
            <input
              type="radio"
              value="thumbnails"
              checked={viewMode === 'thumbnails'}
              onChange={handleViewModeChange}
            />
            Thumbs
          </label>
          <label>
            <input
              type="radio"
              value="tiled"
              checked={viewMode === 'tiled'}
              onChange={handleViewModeChange}
            />
            Embeds
          </label>
        </div>
      </div>
      {loading && <p>Loading videos...</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && (
        <div className={viewMode === 'list' ? 'list-view' : 'tiled-view'}>
          {viewMode === 'list' ? (
            <ul>
              {videos.map((video) => (
                <li key={video.id} className={video.hasBeenWatched ? 'checked' : ''}>
                  <span className="list-view-item">
                    {video.channelTitle.substring(0,25).trim()} - {new Date(video.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {' '}
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {video.title}
                    </a>
                  </span>
                  <input
                    type="checkbox"
                    checked={video.hasBeenWatched}
                    onChange={() => handleWatchedChange(video.id)}
                  />
                </li>
              ))}
            </ul>
          ) : viewMode === 'tiled' ? (
            <div>
              <div className="video-grid">
                {paginatedVideos.map((video) => (
                  <div key={video.id} className={`video-tile ${video.hasBeenWatched ? 'video-tile-watched' : ''}`}>
                    <input
                      type="checkbox"
                      checked={video.hasBeenWatched}
                      onChange={() => handleWatchedChange(video.id)}
                    />
                    <p className="video-tile-header">{video.channelTitle.substring(0,25).trim()} - {new Date(video.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    {/* in embed view, watched video embeds are replaced by thumbs */}
                    {video.hasBeenWatched ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} /* also sd, hq */
                          alt={video.title}
                          width="240"
                          height="135"
                        />
                      </a>
                    ) : (
                      <iframe
                        width="240"
                        height="135"
                        src={`https://www.youtube.com/embed/${video.id}`}
                        title={video.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    )}
                    <p>{video.title}</p>
                  </div>
                ))}
              </div>
              <div className="pagination">
                {Array.from({ length: Math.ceil(videos.length / itemsPerPageEmbeds) }, (_, index) => (
                  <button
                    key={index + 1}
                    onClick={() => handlePageChange(index + 1)}
                    disabled={currentPage === index + 1}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="pagination">
                {Array.from({ length: Math.ceil(videos.length / itemsPerPageThumbs) }, (_, index) => (
                  <button
                    key={index + 1}
                    onClick={() => handlePageChange(index + 1)}
                    disabled={currentPage === index + 1}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="video-grid">
                {paginatedVideos.map((video) => (
                  <div key={video.id} className={`video-tile ${video.hasBeenWatched ? 'video-tile-watched' : ''}`}>
                    <input
                      type="checkbox"
                      checked={video.hasBeenWatched}
                      onChange={() => handleWatchedChange(video.id)}
                    />
                    <p className="video-tile-header">{video.channelTitle.substring(0,25).trim()} - {new Date(video.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} /* also sd, hq */
                        alt={video.title}
                        width="240"
                        height="135"
                      />
                    </a>
                    <p>{video.title}</p>
                  </div>
                ))}
              </div>
              <div className="pagination">
                {Array.from({ length: Math.ceil(videos.length / itemsPerPageThumbs) }, (_, index) => (
                  <button
                    key={index + 1}
                    onClick={() => handlePageChange(index + 1)}
                    disabled={currentPage === index + 1}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="channel-controls">
      <div className="vertical-group">
          <div>
            <label>
              Videos per channel{' '}
              <input
                type="number"
                value={perChannelQueryCount}
                onChange={handlePerChannelQueryCountChange}
                min="1"
                max="50"
              />
            </label>
          </div>
          <div>
            <label>
              Months of history{' '}
              <input
                type="number"
                value={historyMonths}
                onChange={handleHistoryMonthsChange}
                min="1"
                max="9"
              />
            </label>
          </div>
        </div>
        <div className="vertical-group">
          <button onClick={resetAPITimer}>Force refresh</button>
          <button onClick={resetVideos}>Purge cache</button>
        </div>
      </div>
      <div style={{ paddingTop: '2rem' }}>Made with &#x2665; by <a href="https://andrewbackhouse.com/" target="_blank">Andrew</a></div>
    </main>
  );
}

export default App;