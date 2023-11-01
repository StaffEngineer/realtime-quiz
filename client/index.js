const Ably = require('ably');
const readline = require('readline');

const SERVER_URL = process.env.SERVER_URL;
const USER_NAME = process.env.USER_NAME;
const GLOBAL_QUIZ_CHANNEL_NAME = 'quiz-main-channel';


const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (query, timeout) => new Promise((resolve, reject) => {
    const ac = new AbortController();
    const signal = ac.signal;
    rl.question(query, { signal }, resolve)
    setTimeout(() => {
        ac.abort()
        reject()
    }, timeout - 500);
});

let globalChannel

process.on('SIGINT', function () {
    globalChannel?.presence.leaveClient()
    process.exit();
});

(async () => {
    try {
        const realtime = new Ably.Realtime.Promise({ authUrl: `${SERVER_URL}/auth` });
        await realtime.connection.once("connected");
        globalChannel = realtime.channels.get(GLOBAL_QUIZ_CHANNEL_NAME)
        const clientId = realtime.auth.tokenDetails.clientId
        console.log('clientId', clientId)
        const clientChannel = realtime.channels.get(`user${clientId}`)
        await globalChannel.attach()
        await clientChannel.attach()
        globalChannel.presence.enterClient()
        const { quizId, msg } = await new Promise((resolve, _reject) => {
            clientChannel.subscribe('quiz-id', (msg) => {
                resolve(msg.data)
            })
        })
        console.log('Quiz status:', msg)
        const quizChannel = realtime.channels.get(`quiz${quizId}`)
        await quizChannel.attach()
        await new Promise((resolve, _reject) => {
            quizChannel.subscribe('start', () => {
                resolve()
            })
        });
        clientChannel.publish('name', { name: USER_NAME })
        console.log("Quiz has started")
        quizChannel.subscribe('question', async ({ data }) => {
            console.log('Question: ' + data.text)
            console.log('Possible answers: ' + data.options)
            console.log('Time to answer: ' + data.timeToAnswer / 1000 + ' seconds')
            console.log('Type comma separated numbers of your answers and press enter')
            const answer = await prompt('Answer: ', data.timeToAnswer).catch((e) => {})
            if (answer) {
                clientChannel.publish('answer', { questionId: data.questionId, answer: answer.split(',').map((a) => parseInt(a)) })
            }
        })
        await new Promise((resolve, _reject) => {
            quizChannel.subscribe('finish', ({ data }) => {
                console.log('Quiz has finished')
                console.log('Leaderboard:')
                console.table(data.board)
                resolve()
            })
        });
        globalChannel.detach()
        process.exit(0);
    } catch (e) {
        globalChannel.presence.leaveClient()
        console.error("Error", e)
    }
})();
