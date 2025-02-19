import { getColour } from './utility';

interface PageSelectorProps {
  currentPage: number;
  itemsTotal: number;
  itemsPerPage: number;
  newPageHandler: (page: number) => void;
}

export function PageSelector({ currentPage, itemsTotal, itemsPerPage, newPageHandler }: PageSelectorProps) {
  return (
    <div className="pagination">
      {Array.from({ length: Math.ceil(itemsTotal / itemsPerPage) }, (_, index) => (
        <button
          key={index + 1}
          onClick={() => newPageHandler(index + 1)}
          disabled={currentPage === index + 1}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}

import { Video } from './youtube';

interface VideoProps {
  videos: Video[];
  handleWatchedChange: (videoId: string) => void;
  embedsMode?: boolean;
}

export function VideoList({videos, handleWatchedChange}: VideoProps) {
  return (
    <ul>
      {videos.map((video) => (
        <li key={video.id} className={video.hasBeenWatched ? 'checked' : ''} style={{ backgroundColor: getColour(video.channelTitle) }}>
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
  );
}

export function VideoGrid({videos, handleWatchedChange, embedsMode = false}: VideoProps) {
  return (
    <div className="video-grid">
      {videos.map((video) => (
        <div key={video.id} className={`video-tile ${video.hasBeenWatched ? 'video-tile-watched' : ''}`} style={{ backgroundColor: getColour(video.channelTitle) }}>
          <input
            type="checkbox"
            checked={video.hasBeenWatched}
            onChange={() => handleWatchedChange(video.id)}
          />
          <p className="video-tile-header">{video.channelTitle.substring(0,25).trim()} - {new Date(video.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
          {/* in embed view, watched video embeds are replaced by thumbs */}
          {video.hasBeenWatched || !embedsMode ? (
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
  );
}