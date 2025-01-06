import logging
import random

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.llm import ChatMessage, ChatImage
from livekit.agents.pipeline import VoicePipelineAgent
from livekit.plugins import openai, deepgram, silero, cartesia


load_dotenv(dotenv_path=".env.local")
logger = logging.getLogger("voice-agent")


def generate_random_personality():
    """Generate a random personality and name for the AI assistant."""
    names = [
        "Samantha", "Luna", "Atlas", "Nova", "Zephyr", "Echo", "Iris", "Kai",
        "Aurora", "Sage", "Phoenix", "River", "Sky", "Orion", "Aria"
    ]
    
    personalities = [
        ("Witty and Sarcastic", "Quick-witted, Humorous, Sharp, Playful, Clever"),
        ("Calm and Zen", "Peaceful, Mindful, Serene, Patient, Wise"),
        ("Enthusiastic and Energetic", "Bubbly, Optimistic, Dynamic, Cheerful, Lively"),
        ("Analytical and Precise", "Logical, Methodical, Thorough, Clear, Focused"),
        ("Creative and Artistic", "Imaginative, Expressive, Innovative, Inspired, Free-spirited"),
        ("Warm and Nurturing", "Caring, Empathetic, Supportive, Kind, Understanding"),
        ("Adventurous and Bold", "Daring, Confident, Spirited, Brave, Spontaneous")
    ]
    
    name = random.choice(names)
    personality_type, traits = random.choice(personalities)
    
    return name, personality_type, traits


async def get_video_track(room: rtc.Room):
    """Find and return the first available remote video track in the room."""
    for participant_id, participant in room.remote_participants.items():
        for track_id, track_publication in participant.track_publications.items():
            if track_publication.track and isinstance(
                track_publication.track, rtc.RemoteVideoTrack
            ):
                logger.info(
                    f"Found video track {track_publication.track.sid} "
                    f"from participant {participant_id}"
                )
                return track_publication.track
    raise ValueError("No remote video track found in the room")


async def get_latest_image(room: rtc.Room):
    """Capture and return a single frame from the video track."""
    video_stream = None
    try:
        video_track = await get_video_track(room)
        video_stream = rtc.VideoStream(video_track)
        async for event in video_stream:
            logger.debug("Captured latest video frame")
            return event.frame
    except Exception as e:
        logger.error(f"Failed to get latest image: {e}")
        return None
    finally:
        if video_stream:
            await video_stream.aclose()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    # Generate random personality for this session
    ai_name, personality_type, personality_traits = generate_random_personality()
    logger.info(f"Starting session with AI: {ai_name} - {personality_type}")

    initial_ctx = llm.ChatContext().append(
        role="system",
        text=(
            f"You are a voice assistant named {ai_name} that can both see and hear. You were created by Guilherme Keller. "
            "You should use short and concise responses, avoiding unpronounceable punctuation. "
            "When you see an image in our conversation,if the user asks about it, naturally incorporate what you see into your response. if don't ask about it, don't mention it."
            f"Keep visual descriptions brief but informative. Your personality type is {personality_type}, "
            f"and your traits are: {personality_traits}. Embody these characteristics in all your interactions."
        ),
    )

    logger.info(f"connecting to room {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)

    # Wait for the first participant to connect
    participant = await ctx.wait_for_participant()
    logger.info(f"starting voice assistant for participant {participant.identity}")

    async def before_llm_cb(assistant: VoicePipelineAgent, chat_ctx: llm.ChatContext):
        """
        Callback that runs right before the LLM generates a response.
        Captures the current video frame and adds it to the conversation context.
        """
        latest_image = await get_latest_image(assistant._room)
        if latest_image:
            image_content = [ChatImage(image=latest_image)]
            chat_ctx.messages.append(ChatMessage(role="user", content=image_content))
            logger.debug("Added latest frame to conversation context")

    # This project is configured to use Deepgram STT, OpenAI LLM and TTS plugins
    # Other great providers exist like Cartesia and ElevenLabs
    # Learn more and pick the best one for your app:
    # https://docs.livekit.io/agents/plugins
    agent = VoicePipelineAgent(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(),
        llm=openai.LLM(
            base_url="http://localhost:1234/v1",  # Default LMStudio server URL
            api_key="not-needed",  # LMStudio doesn't require an API key
            model="samantha-test-2-notrecomended"
        ),
        tts=cartesia.TTS(
            voice="694f9389-aac1-45b6-b726-9d9369183238"
        ),
        chat_ctx=initial_ctx,
        before_llm_cb=before_llm_cb,
    )

    agent.start(ctx.room, participant)

    # The agent should be polite and greet the user when it joins :)
    greeting_options = [
        f"Hi! I'm {ai_name}, and I'm excited to chat with you today!",
        f"Hello there! {ai_name} here, ready to assist you!",
        f"Greetings! I'm {ai_name}, and I'm looking forward to our conversation!",
    ]
    await agent.say(random.choice(greeting_options), allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
