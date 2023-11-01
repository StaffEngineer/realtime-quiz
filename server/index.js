const { v4: uuidv4 } = require('uuid');
const express = require('express');
const { Worker, isMainThread } = require('worker_threads');

const Ably = require('ably');

const app = express();

const GLOBAL_QUIZ_CHANNEL_NAME = 'quiz-main-channel';
const REQUISITE_PARTICIPANTS = 2

let currentParticipants = new Set()
let currentQuizId = uuidv4()

// Ably setup
const ABLY_API_KEY = process.env.ABLY_API_KEY;
const realtime = new Ably.Realtime({ key: ABLY_API_KEY });

// Define a route for clients to request tokens
app.get('/auth', (_request, response) => {
    const tokenParams = { clientId: uuidv4() };
    realtime.auth.createTokenRequest(tokenParams, function (err, tokenRequest) {
        if (err) {
            response
                .status(500)
                .send('Error requesting token: ' + JSON.stringify(err));
        } else {
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.send(JSON.stringify(tokenRequest));
        }
    });
});

realtime.connection.once('connected', () => {
    const globalQuizChannel = realtime.channels.get(GLOBAL_QUIZ_CHANNEL_NAME);
    globalQuizChannel.presence.subscribe('enter', (player) => {
        const userChannel = realtime.channels.get(`user${player.clientId}`);
        currentParticipants.add(player.clientId)
        if (currentParticipants.size === REQUISITE_PARTICIPANTS) {
            startQuiz(currentQuizId, currentParticipants);
            userChannel.publish('quiz-id', { quizId: currentQuizId, msg: 'Quiz is starting' });
            currentParticipants.clear();
            currentQuizId = uuidv4();
        } else if (currentParticipants.size < REQUISITE_PARTICIPANTS) {
            userChannel.publish('quiz-id', { quizId: currentQuizId, msg: 'Waiting for more people to start a quiz...' });
        }
    });
    globalQuizChannel.presence.subscribe('leave', (player) => {
        currentParticipants.delete(player.clientId)
    });
});

const listener = app.listen(process.env.PORT || 8082, () => {
    console.log('Realtime-quiz server is listening on port ' + listener.address().port);
});

function startQuiz(quizId, participants) {
    if (isMainThread) {
        const worker = new Worker('./quiz-room.js', {
            workerData: { quizId, participants: [...participants] }
        });
        worker.on('message', (data) => {
            console.log(`Worker thread ${worker.threadId} sent message: ${JSON.stringify(data)}`);
        });
        worker.on('error', (error) => {
            console.log(`Worker exited due to error: ${error}`);
        });
        worker.on('exit', (code) => {
            console.log(`Worker exited`);
            if (code !== 0) {
                console.log(`Worker exited with error code: ${code}`);
            }
        });
    }
}
