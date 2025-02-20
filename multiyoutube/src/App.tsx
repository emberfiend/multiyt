import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchVideosAndUpdateChannels, Video, Channel, FetchResult } from './youtube';
import { PageSelector, VideoList, VideoGrid } from './Page';
import { getColour } from './utility';

function App() {
  
  // STATE

  const itemsPerPageThumbs = 12;
  const itemsPerPageEmbeds = 4;
  const itemsPerPageList = 24;

  const mergeChannels = (channelsA: Channel[], channelsB: Channel[]): Channel[] => {
    const merged = [...channelsA];
    for (const Bchannel of channelsB) {
      if (!merged.some(channel => channel.humanReadable === Bchannel.humanReadable)) {
        merged.push(Bchannel);
      }
    }
    const channelsSorted = merged.sort((a, b) => a.humanReadable.toLowerCase().localeCompare(b.humanReadable.toLowerCase()));
    return channelsSorted;
  };
  const [videos, setVideos] = useState<Video[]>(() => {
    const savedVideos = localStorage.getItem('videos');
    return savedVideos ? JSON.parse(savedVideos) : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAPICall, setLastAPICall] = useState<number>(() => {
    return parseInt(localStorage.getItem('lastAPICall') || '0', 10);
  });
  const [channels, setChannels] = useState<Channel[]>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlChannels = urlParams.get('channels') || 'HGModernism~Paul.Sellers~ZeFrank';
    const localChannels = localStorage.getItem('channels') || '[]';
    const mergedChannels = mergeChannels(JSON.parse(localChannels), urlChannels.split('~').map(channel => ({ humanReadable: channel, channelId: '', uploadsPlaylistId: '' })));
    localStorage.setItem('channels', JSON.stringify(mergedChannels));
    if (mergedChannels.length !== JSON.parse(localChannels).length) {
      setLastAPICall(0);
      localStorage.setItem('lastAPICall', '0');
    }
    return mergedChannels;
  });
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [newChannel, setNewChannel] = useState<string | null>(null);
  const [filterTerms, setFilterTerms] = useState<string>(() => {
    return localStorage.getItem('filterTerms') || '';
  });
  //const [inputValue, setInputValue] = useState<string>(channels);
  enum ViewMode {
    List = 'list',
    Thumbs = 'thumbs',
    Embeds = 'embeds'
  }
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return localStorage.getItem('viewMode') as ViewMode || ViewMode.List;
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
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('apiKey') || 'AIzaSyAm9PqXUWUL7r-uEWL0OAmnZ3kL8oFyV0M';
  });
  const [hideShorts, setHideShorts] = useState<boolean>(() => {
    return localStorage.getItem('hideShorts') === 'true';
  });
  const [hideWatched, setHideWatched] = useState<boolean>(() => {
    return localStorage.getItem('hideWatched') === 'true';
  });
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);
  const [dummy, setDummy] = useState<number>(0);

  // HOOKS

  useEffect(() => {
    const initializeGapiThenFetchData = () => {
      // check if script element exists
      if (window.gapi?.client) {
        fetchData();
        return;
      }
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
        fetchData();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        if (window.gapi.client) {
          fetchData();
          return;
        }
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
      // dummy state changes 5 minutes from now, and is a dependency of this useEffect, prompting it to re-run every 5 minutes (and do useful API things if appropriate)
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      setRefreshTimer(setInterval(() => {
        setDummy((prev) => prev + 1);
      }, 5 * 60 * 1000)); // 5 min

      const now = Date.now();
      const volumeScalar = Math.floor(perChannelQueryCount / 10) + 1 * channels.length;
      const cullTimer = volumeScalar * 10 * 60 * 1000;
      console.log('Volume scalar is', volumeScalar, 'with an API hit timer of', cullTimer / 60000, 'minutes');
      if (!isAddingChannel && now - lastAPICall < cullTimer) {
        console.log('Using cached data:', videos.length, 'videos in localStorage');
        console.log('Next API hit in', Math.round((cullTimer - (now - lastAPICall)) / 60000), 'minutes');
        return;
      }
      console.log('Fetching fresh data');

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
        
        // if we're adding a channel, we pass an array with only that channel in it, for a smaller fetch
        // otherwise we send everything
        const channelsToFetch = isAddingChannel ? [{ humanReadable: newChannel!, channelId: '', uploadsPlaylistId: '' }] : channels;

        // run the fetch. FetchResult below. note that per the name, channels are updated with their youtube id and uploads playlist id in the returned array
        /* videos: Video[];
           channels: Channel[]; */
        const result: FetchResult = await fetchVideosAndUpdateChannels(
          channelsToFetch,
          perChannelQueryCount,
          apiKey
        );
        setLastAPICall(now);
        localStorage.setItem('lastAPICall', now.toString());

        // handle channels
        if (isAddingChannel && newChannel) {
          setIsAddingChannel(false);
        }
        const mergedChannels = mergeChannels(channels, result.channels);
        setChannels(mergedChannels);
        localStorage.setItem('channels', JSON.stringify(result.channels))

        // handle videos
        const fetchedVideosWithWatched = result.videos;
        setVideos((prevVideos) => {
          // concat arrays and deduplicate by video ID
          const mergedVideos = [...prevVideos, ...fetchedVideosWithWatched];
          const uniqueVideosMap = new Map<string, Video>();
          mergedVideos.forEach(video => {
            if (uniqueVideosMap.has(video.id)) {
              // ensure hasBeenWatched=true is retained when deduplicating
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
          // cullOldVideos broken out so it can be used elsewhere to react to historyMonths changes
          return cullOldVideos(uniqueVideos);
        });
      } catch (err) {
        console.error('Error fetching videos:', err);
        setError('Error fetching videos');
      } finally {
        setLoading(false);
      }
    };

    initializeGapiThenFetchData();
  }, 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dummy, lastAPICall, videos, perChannelQueryCount, newChannel, isAddingChannel, historyMonths]); // channels omitted

  useEffect(() => {
    localStorage.setItem('videos', JSON.stringify(videos));
  }, [videos]);

  const cullOldVideos = useCallback((videos: Video[]) => {
    const dateInPast = new Date();
    dateInPast.setMonth(dateInPast.getMonth() - historyMonths);
    const culledVideos = videos.filter(video => new Date(video.publishedAt) > dateInPast);
    console.log("Culling", videos.length - culledVideos.length, "videos older than", historyMonths, "months");
    return culledVideos;
  }, [historyMonths])

  useEffect(() => {
    setVideos(prevVideos => {
      const culledVideos = cullOldVideos(prevVideos);
      localStorage.setItem('videos', JSON.stringify(culledVideos));
      return culledVideos;
    });
  }, [historyMonths, cullOldVideos]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('channels', channels.map(channel => channel.humanReadable).join('~'));
    window.history.replaceState(null, '', `?${urlParams.toString()}`);
    localStorage.setItem('channels', JSON.stringify(channels));
  }, [channels]);

  const inputRef = useRef<HTMLInputElement>(null);

  /* OTHER EFFECTS */

  const resetAPITimer = () => {
    setLastAPICall(0);
    localStorage.setItem('lastAPICall', '0');
  };

  const resetVideos = () => {
    setVideos([]);
    localStorage.removeItem('videos');
  }

  /* STATE REDUCTION */

  const filteredVideos = videos.filter(video => {
    if (hideShorts && video.isShort) return false;
    if (hideWatched && video.hasBeenWatched) return false;
    if (filterTerms) {
      const terms = filterTerms.split(',').map(term => term.trim().toLowerCase());
      if (terms.some(term => term && video.title.toLowerCase().includes(term))) return false;
    }
    return true;
  });

  const paginatedVideos = viewMode === ViewMode.Thumbs
    ? filteredVideos.slice((currentPage - 1) * itemsPerPageThumbs, currentPage * itemsPerPageThumbs)
    : viewMode === ViewMode.Embeds
    ? filteredVideos.slice((currentPage - 1) * itemsPerPageEmbeds, currentPage * itemsPerPageEmbeds)
    : filteredVideos.slice((currentPage - 1) * itemsPerPageList, currentPage * itemsPerPageList);

  /* HANDLERS - basics */

  const handleRemoveChannel = (channel: string) => {
    const newIdentifiers = channels.filter(c => c.humanReadable !== channel);
    setChannels(newIdentifiers);
    localStorage.setItem('channels', JSON.stringify(newIdentifiers));
    
    // remove videos created by said channel from state
    setVideos((prevVideos) => prevVideos.filter(video => video.channelIdHumanReadable !== channel));
  };

  const handleAddChannel = (newChannel: string) => {
    if (!newChannel) return;

    inputRef.current!.value = '';
  
    setIsAddingChannel(true);
    setNewChannel(newChannel);
  };

  const handleViewModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newViewMode = event.target.value as ViewMode;
    setViewMode(newViewMode);
    localStorage.setItem('viewMode', newViewMode);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    localStorage.setItem('currentPage', newPage.toString());
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

  /* HANDLERS - settings */

  const handleHideShortsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHideShorts(newValue);
    localStorage.setItem('hideShorts', newValue.toString());
  };

  const handleHideWatchedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHideWatched(newValue);
    localStorage.setItem('hideWatched', newValue.toString());
  };

  const handleFilterTermsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTerms = event.target.value;
    setFilterTerms(newTerms);
    localStorage.setItem('filterTerms', newTerms);
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

  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = event.target.value;
    setApiKey(newKey);
    localStorage.setItem('apiKey', newKey);
  };

  /* RENDERING */

  return (
    <main>
      <h1>MultiYT</h1>
      <div className="channel-list">
        {channels.map((channel) => (
          <span key={channel.humanReadable} className="channel-item" style={{ backgroundColor: getColour(channel.humanReadable) }}>
            {channel.humanReadable}
            <button onClick={() => handleRemoveChannel(channel.humanReadable)}>x</button>
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
              value={ViewMode.List}
              checked={viewMode === ViewMode.List}
              onChange={handleViewModeChange}
            />
            List
          </label>
          <label>
            <input
              type="radio"
              value="thumbs"
              checked={viewMode === ViewMode.Thumbs}
              onChange={handleViewModeChange}
            />
            Thumbs
          </label>
          <label>
            <input
              type="radio"
              value="embeds"
              checked={viewMode === ViewMode.Embeds}
              onChange={handleViewModeChange}
            />
            Embeds
          </label>
          <label>
            <input
              type="checkbox"
              checked={hideShorts}
              onChange={handleHideShortsChange}
            />
            Hide shorts
          </label>
          <label>
            <input
              type="checkbox"
              checked={hideWatched}
              onChange={handleHideWatchedChange}
            />
            Hide watched
          </label>
          <label>
            Filter{' '}
            <input
              type="text"
              value={filterTerms}
              onChange={handleFilterTermsChange}
              placeholder="trump,politics,reacts"
              style={{ width: '150px' }}
            />
          </label>
        </div>
      </div>
      {loading && <p className="loading">Loading videos...</p>}
      {error && <p>Error: {error}</p>}
      {/*!loading && */!error && (
        <div className={viewMode === ViewMode.List ? 'list-view' : 'tiled-view'}>
          {viewMode === ViewMode.List ? (
            <div>
              <PageSelector currentPage={currentPage} itemsTotal={filteredVideos.length} itemsPerPage={itemsPerPageList} newPageHandler={handlePageChange} />
              <VideoList videos={paginatedVideos} handleWatchedChange={handleWatchedChange} />
              <PageSelector currentPage={currentPage} itemsTotal={filteredVideos.length} itemsPerPage={itemsPerPageList} newPageHandler={handlePageChange} />
            </div>
          ) : viewMode === ViewMode.Embeds ? (
            <div>
              <VideoGrid videos={paginatedVideos} handleWatchedChange={handleWatchedChange} embedsMode={true} />
              <PageSelector currentPage={currentPage} itemsTotal={filteredVideos.length} itemsPerPage={itemsPerPageEmbeds} newPageHandler={handlePageChange} />
            </div>
          ) : (
            <div>
              <PageSelector currentPage={currentPage} itemsTotal={filteredVideos.length} itemsPerPage={itemsPerPageThumbs} newPageHandler={handlePageChange} />
              <VideoGrid videos={paginatedVideos} handleWatchedChange={handleWatchedChange} embedsMode={false} />
              <PageSelector currentPage={currentPage} itemsTotal={filteredVideos.length} itemsPerPage={itemsPerPageThumbs} newPageHandler={handlePageChange} />
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
                style={{ width: '40px' }}
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
                style={{ width: '40px' }}
              />
            </label>
          </div>
        </div>
        <div className='vertical-group'>
          <label>
            API key{' '}
            <input 
              className="api-key"
              type="text"
              value={apiKey}
              onChange={handleApiKeyChange}
              placeholder="API Key"
            />
          </label>
          <div className="info">When my key runs out of quota, <a href="https://developers.google.com/youtube/registering_an_application" target='blank'>request your own</a> (free).</div>
        </div>
        <div className="vertical-group">
          <button onClick={resetAPITimer}>Force refresh</button>
          <button onClick={resetVideos}>Purge cache</button>
        </div>
      </div>
      <div style={{ paddingTop: '2rem' }}>
        Made with &#x2665; by <a href="https://andrewbackhouse.com/" target="_blank">Andrew</a>
      </div>
    </main>
  );
}

export default App;