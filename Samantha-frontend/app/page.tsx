"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  AgentState,
  DisconnectButton,
  useLocalParticipant,
} from "@livekit/components-react";
import { useCallback, useEffect, useState } from "react";
import { MediaDeviceFailure } from "livekit-client";
import type { ConnectionDetails } from "./api/connection-details/route";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import { CloseIcon } from "@/components/CloseIcon";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { Track, TrackPublication, LocalParticipant, LocalTrack } from "livekit-client";
import AnimatedBackground from "../components/AnimatedBackground";
import ViewerCounter from "../components/ViewerCounter";

function LoadingAnimation({ onLoadComplete }: { onLoadComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onLoadComplete();
    }, 3000); // Show loading for 3 seconds

    return () => clearTimeout(timer);
  }, [onLoadComplete]);

  return (
    <div className="loading-container">
      <AnimatedBackground isIntro={true} />
      <div className="welcome-text">
        <span className="welcome-normal">Welcome to </span>
        <span className="welcome-stylized">CosmOS</span>
      </div>
      <div className="orb-container">
        <div className="orb-glow"></div>
        <div className="orb"></div>
      </div>
    </div>
  );
}

export default function Page() {
  const [connectionDetails, updateConnectionDetails] = useState<
    ConnectionDetails | undefined
  >(undefined);
  const [agentState, setAgentState] = useState<AgentState>("disconnected");
  const [isLoading, setIsLoading] = useState(true);

  const onConnectButtonClicked = useCallback(async () => {
    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ??
      "/api/connection-details",
      window.location.origin
    );
    const response = await fetch(url.toString());
    const connectionDetailsData = await response.json();
    updateConnectionDetails(connectionDetailsData);
  }, []);

  return (
    <>
      {isLoading && (
        <LoadingAnimation onLoadComplete={() => setIsLoading(false)} />
      )}
      <main
        data-lk-theme="default"
        className={`h-full grid content-center ${
          isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'
        }`}
      >
        <AnimatedBackground isIntro={false} />
        <ViewerCounter />
        <LiveKitRoom
          token={connectionDetails?.participantToken}
          serverUrl={connectionDetails?.serverUrl}
          connect={connectionDetails !== undefined}
          audio={true}
          video={false}
          onMediaDeviceFailure={onDeviceFailure}
          onDisconnected={() => {
            updateConnectionDetails(undefined);
          }}
          className="relative"
        >
          <SimpleVoiceAssistant onStateChange={setAgentState} />
          <ControlBar
            onConnectButtonClicked={onConnectButtonClicked}
            agentState={agentState}
          />
          <RoomAudioRenderer />
          <NoAgentNotification state={agentState} />
        </LiveKitRoom>
      </main>
    </>
  );
}

function SimpleVoiceAssistant(props: {
  onStateChange: (state: AgentState) => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  useEffect(() => {
    props.onStateChange(state);
  }, [props, state]);
  return (
    <div className="h-[300px] max-w-[90vw] mx-auto flex items-center justify-center">
      <div className={`orb-container ${state === "thinking" ? "thinking-animation" : state === "speaking" ? "talking-animation" : ""}`}>
        <div className="orb-glow"></div>
        <div className="orb"></div>
      </div>
    </div>
  );
}

function ControlBar(props: {
  onConnectButtonClicked: () => void;
  agentState: AgentState;
}) {
  const krisp = useKrispNoiseFilter();
  const { localParticipant } = useLocalParticipant();
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraTrack, setCameraTrack] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    krisp.setNoiseFilterEnabled(true);
  }, []);

  const toggleCamera = async () => {
    try {
      if (!localParticipant) return;

      if (isCameraOn && cameraTrack) {
        // Stop camera
        cameraTrack.stop();
        setCameraTrack(null);
        setIsCameraOn(false);
      } else {
        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await localParticipant.publishTrack(videoTrack);
          setCameraTrack(videoTrack);
          setIsCameraOn(true);
        }
      }
    } catch (error) {
      console.error('Error toggling camera:', error);
      setIsCameraOn(false);
      setCameraTrack(null);
    }
  };

  return (
    <div className="relative h-[100px]">
      <AnimatePresence>
        {props.agentState === "disconnected" && (
          <motion.button
            initial={{ opacity: 0, top: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 1, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="uppercase absolute left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black rounded-md"
            onClick={() => props.onConnectButtonClicked()}
          >
            Start a conversation
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {props.agentState !== "disconnected" &&
          props.agentState !== "connecting" && (
            <motion.div
              initial={{ opacity: 0, top: "10px" }}
              animate={{ opacity: 1, top: 0 }}
              exit={{ opacity: 0, top: "-10px" }}
              transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center items-center gap-4"
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <button
                onClick={toggleCamera}
                className={`px-4 py-1 rounded-md transition-colors ${
                  isCameraOn
                    ? "bg-[#6b221a] text-white"
                    : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                {isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
              </button>
              <DisconnectButton>
                <CloseIcon />
              </DisconnectButton>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error?: MediaDeviceFailure) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab"
  );
}
