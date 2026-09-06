import { Info, TriangleAlert } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";

export function RemoteControlWarnings({
  normalJoinTakeoverHint,
  occupiedBySelfClient,
  occupyingParticipantLabel,
  roomJoinFailureMessage,
  selectedDeviceOccupied,
  selfDeviceBlockedReason,
  signalGatewayErrorHint,
}: Pick<
  RemoteControlPageProps,
  | "normalJoinTakeoverHint"
  | "occupiedBySelfClient"
  | "occupyingParticipantLabel"
  | "roomJoinFailureMessage"
  | "selectedDeviceOccupied"
  | "selfDeviceBlockedReason"
  | "signalGatewayErrorHint"
>) {
  return (
    <>
      {occupiedBySelfClient || selectedDeviceOccupied ? (
        <div className="occupancy-callout info">
          <Info size={17} />
          <span>
            {occupiedBySelfClient
              ? "检测到你之前的会话仍在占用，将自动接管。"
              : `该设备正被${occupyingParticipantLabel}占用，本页会自动接管并断开上一处控制。`}
          </span>
        </div>
      ) : null}
      {roomJoinFailureMessage ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{roomJoinFailureMessage}</span>
        </div>
      ) : null}
      {selfDeviceBlockedReason ? (
        <div className="occupancy-callout">
          <TriangleAlert size={17} />
          <span>{selfDeviceBlockedReason}</span>
        </div>
      ) : null}
      {normalJoinTakeoverHint ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{normalJoinTakeoverHint}</span>
        </div>
      ) : null}
      {signalGatewayErrorHint ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{signalGatewayErrorHint}</span>
        </div>
      ) : null}
    </>
  );
}
