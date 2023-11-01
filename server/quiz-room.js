const Ably = require('ably');
const { parentPort, workerData } = require('worker_threads');
const utils  = require('./utils');

const questions = require('./questions.json');
const TIME_TO_ANSWER = 20000;
const ABLY_API_KEY = process.env.ABLY_API_KEY;

let board = new Map()
let userNames = new Map()
let currentQuestionAnswer = null; 
let currentQuestionId = null;
let participants = workerData.participants;
let realtime;
let quizChannel;

(async () => {
    try {
        realtime = new Ably.Realtime.Promise({ key: ABLY_API_KEY });
        await realtime.connection.once("connected");
        quizChannel = realtime.channels.get(`quiz${workerData.quizId}`);
        for (let participant of participants) {
            board.set(participant, new Set())
            let userChannel = realtime.channels.get(`user${participant}`);
            await userChannel.attach();
            userChannel.subscribe('answer', ({ data }) => {
                if (currentQuestionId === data.questionId) {
                    if (currentQuestionAnswer.length === data.answer.length && currentQuestionAnswer.sort((a,b) => a - b).join('') === data.answer.join('')) {
                        board.set(participant, (board.get(participant) ?? new Set).add(data.questionId))
                    }
                } else {
                    console.log('Answer to question ' + data.questionId + ' was ignored')
                }
            })
            userChannel.subscribe('name', ({ data }) => {
                userNames.set(participant, data.name)
            })
        }
        quizChannel.publish('start', {})
        utils.shuffleArray(questions);
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            currentQuestionAnswer = question.answer
            currentQuestionId = i
            quizChannel.publish('question', { questionId: i, text: question.text, options: question.options, timeToAnswer: TIME_TO_ANSWER });
            await new Promise((resolve, _reject) => {
                setTimeout(() => {
                    resolve();
                }, TIME_TO_ANSWER);
            });
        }
        board = Array.from(board.entries()).sort((a, b) => b[1].size - a[1].size).map(([participant, score]) => ({ name: userNames.get(participant), score: score.size }))
        quizChannel.publish('finish', { board })
        killWorkerThread();
    } catch (e) {
        killWorkerThread()
        console.error("Error", e)
    }

    function killWorkerThread() {
        parentPort.postMessage({
            msg: 'Quiz has ended'
        });

        for (let participant of participants) {
            realtime?.channels.get(`user${participant}`).detach();
        }
        quizChannel?.detach()
        process.exit(0);
    }
})();

