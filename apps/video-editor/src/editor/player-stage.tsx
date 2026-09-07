import { AlertCircle } from 'lucide-react';
import type { Region } from '@codex-ux/protocol';
import { usePlayer, type PlayerOptions } from '../hooks/use-player';

interface Props extends PlayerOptions {
  marking: boolean;
  region: Region | null;
  onNote: (event?: React.MouseEvent<HTMLElement>) => void;
}
export function PlayerStage(props: Props) {
  const { host, ready, refreshing, failure } = usePlayer(props);
  const region = props.region;
  return (
    <div className={`stage-section ${props.compare ? 'comparison-stage' : ''}`}>
      <div
        className="stage-canvas"
        style={{ aspectRatio: `${props.document.width}/${props.document.height}` }}
      >
        <div className="player-host" ref={host} />
        {!ready && !failure && (
          <div className="preview-loading">
            <span className="loading-dot" />
            Opening video
          </div>
        )}
        {failure && (
          <div className="preview-error" role="alert">
            <AlertCircle size={15} />
            {failure}
          </div>
        )}
        {ready && refreshing && <span className="preview-refresh" aria-label="Updating preview" />}
        {region && (
          <>
            <div
              className="region-box"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            >
              <i />
              <i />
              <i />
              <i />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
