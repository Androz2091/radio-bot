const { config } = require('dotenv');
config();

const Discord = require('discord.js');
const client = new Discord.Client({
    intents: [
        Discord.IntentsBitField.Flags.GuildVoiceStates,
        Discord.IntentsBitField.Flags.Guilds,
        Discord.IntentsBitField.Flags.GuildMessages
    ]
});

const {
    NoSubscriberBehavior,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    joinVoiceChannel,
} = require('@discordjs/voice');

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: Math.round(5000 / 20),
    },
});

/**
 * Centralized fatal error handler.
 * Logs the error (with stack if present), then exits the process with non-zero code
 * after a short timeout so logs can flush and other listeners run.
 */
function fatalError(err, context) {
    try {
        const ctx = context ? `[${context}]` : '[fatal]';
        if (err instanceof Error) {
            console.error(`${ctx} ${err.stack || err.message}`);
        } else {
            console.error(`${ctx}`, err);
        }
    } catch (loggingError) {
        // If logging fails, still try to exit.
        console.error('[fatal][loggingError]', loggingError);
    }
    // Give a tiny delay to let stderr flush
    setTimeout(() => process.exit(1), 100);
}

// Process-level handlers so PM2 (or other process managers) can restart the bot on fatal failures.
process.on('uncaughtException', (err) => {
    fatalError(err, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    // reason can be any value
    fatalError(reason, 'unhandledRejection');
});

// Attach top-level error handlers for the Discord client and the audio player.
client.on('error', (err) => {
    fatalError(err, 'discord client error');
});
player.on('error', (err) => {
    fatalError(err, 'audio player error');
});

player.on('stateChange', (oldState, newState) => {
    if (oldState.status === AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Playing) {
        console.log('Playing audio output on audio player');
    } else if (newState.status === AudioPlayerStatus.Idle) {
        console.log('Playback has stopped. Attempting to restart.');
        attachRecorder();
    }
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    attachRecorder();

    setTimeout(async () => {
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

    // Attach connection error handler so voice-connection errors also cause process exit
    connection.on('error', (err) => {
        // if for some reason connection emits an error, bail out so PM2 restarts us
        fatalError(err, 'voice connection error');
    });

    connection.on('stateChange', (oldState, newState) => {
        const oldNetworking = Reflect.get(oldState, 'networking');
        const newNetworking = Reflect.get(newState, 'networking');

        const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
            const newUdp = Reflect.get(newNetworkState, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
        };

        oldNetworking?.off('stateChange', networkStateChangeHandler);
        newNetworking?.on('stateChange', networkStateChangeHandler);
    });
    
        connection.subscribe(player);
        
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 2_000);
            return connection;
        } catch (error) {
            connection.destroy();
            throw error;
        }
    }, 3_000);
});

function attachRecorder() {
    const resource = createAudioResource(process.env.RADIO_STREAM, { inlineVolume: true });
    resource.volume.setVolume(process.env.RADIO_VOLUME || 1);
    player.play(resource);
    console.log('Attached recorder - ready to go!');
}

void client.login(process.env.DISCORD_TOKEN);
