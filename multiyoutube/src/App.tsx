import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchVideos, Video } from './youtube';

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelIdentifiers, setChannelIdentifiers] = useState<string>(() => {
    return localStorage.getItem('channelIdentifiers') || 'CosmicPumpkin,DrGeoffLindsey,HGModernism,LamoGaming,LatteASMR,PracticalEngineeringChannel,ShortCircuit,WilliamOsman2,cherry_official,littlechineseeverywhere,scottmanley,zefrank';
  });
  const [inputValue, setInputValue] = useState<string>(channelIdentifiers);
  const [viewMode, setViewMode] = useState<string>(() => {
    return localStorage.getItem('viewMode') || 'list';
  });

  const apiKey = 'AIzaSyAm9PqXUWUL7r-uEWL0OAmnZ3kL8oFyV0M'; // Replace with your API key
  const perChannelQueryCount = 3;

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
            // Fetch data after successful initialization
            fetchData();
          } catch (error) {
            console.error('Error initializing gapi client:', error);
            // Handle error appropriately
          }
        });
      };
      script.onerror = () => {
        console.error('Error loading gapi script');
        // Handle script loading error appropriately
      };
      document.body.appendChild(script);
    };

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Ensure 'youtube' client is loaded
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
        setVideos(fetchedVideos);
      } catch (err) {
        console.error('Error fetching videos:', err);
        setError('Error fetching videos');
      } finally {
        setLoading(false);
      }
    };

    initializeGapi();
  }, [channelIdentifiers]);

  // Handle channel identifier changes (now extracts value from event)
  const handleChannelIdentifiersChange = useCallback((newValue: string) => {
    console.log('Change:', newValue);
    const newIdentifiers = newValue;
    const sortedIdentifiers = newIdentifiers
      .split(',')
      .map((id) => id.trim())
      .sort()
      .join(',');
    setChannelIdentifiers(sortedIdentifiers);
    localStorage.setItem('channelIdentifiers', sortedIdentifiers);
  }, []); // Dependencies are correctly tracked now

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

  const handleViewModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newViewMode = event.target.value;
    setViewMode(newViewMode);
    localStorage.setItem('viewMode', newViewMode);
  };

  return (
    <div>
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
      {loading && <p>Loading videos...</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && (
        <div className={viewMode === 'list' ? 'list-view' : 'tiled-view'}>
          {viewMode === 'list' ? (
            <ul>
              {videos.map((video) => (
                <li key={video.id}>
                  <a
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  >
                  {video.title}
                  </a>{' '}
                   - {video.channelTitle} - {' '}
                  {new Date(video.publishedAt).toLocaleDateString('en-GB')}
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
    </div>
  );
}

export default App;