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
        connection.subscribe(player);

        // v5
        player.on('connectionCreate', (queue) => {
            connection.on('stateChange', (oldState, newState) => {
                const oldNetworking = Reflect.get(oldState, 'networking');
                const newNetworking = Reflect.get(newState, 'networking');
        
                const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
                const newUdp = Reflect.get(newNetworkState, 'udp');
                    clearInterval(newUdp?.keepAliveInterval);
                }
        
                oldNetworking?.off('stateChange', networkStateChangeHandler);
                newNetworking?.on('stateChange', networkStateChangeHandler);
            });
        });
        
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
