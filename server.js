import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import path from 'path'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

// Setup static file routing for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, 'public')))

// Global game data state
let gameState = {
    currentQuestion: "Welcome to Trivia!",
    activeBuzzer: null,
    buzzerLocked: true,
    players: {}
}

io.on('connection', (socket) => {
    console.log(`A device connected: ${socket.id}`)
    socket.emit('state_update', gameState) // Send the current game state to the device the second it connects

    // 1. Host sends new question: reset buzzer data and unlock the buzzers
    socket.on('host_new_question', (newQuestionText) => {
        gameState.currentQuestion = newQuestionText // Update the server database
        gameState.activeBuzzer = null     // Clear previous buzzer winner
        gameState.buzzerLocked = false    // UNLOCK buzzers for the new question
        io.emit('state_update', gameState)          // Broadcast the change to ALL connected devices
    })

    // 2. Player joins the game
    socket.on('player_join', (name) => {
        gameState.players[socket.id] = { name: name, score: 0 }
        io.emit('state_update', gameState) // Update iPad and Host with new player counts
    })

    // 3. Player hits the Buzzer
    socket.on('player_buzz', () => {
        // ONLY accept if buzzers are open AND nobody has claimed it yet
        if (!gameState.buzzerLocked && !gameState.activeBuzzer) {
            gameState.buzzerLocked = true // Instantly lock everyone else out
            gameState.activeBuzzer = {
                id: socket.id,
                name: gameState.players[socket.id].name
            }
            io.emit('state_update', gameState) // Tell everyone who won the buzz
        }
    })

    // 4. Host Judges the active buzzer
    socket.on('host_judge', (isCorrect) => {
        if (gameState.activeBuzzer) {
            const playerId = gameState.activeBuzzer.id;

            // If correct, find that player in our list and add 10 points
            if (isCorrect && gameState.players[playerId]) {
                gameState.players[playerId].score += 10;
            }

            // Clear out the buzzer state so players can buzz again
            gameState.activeBuzzer = null;
            gameState.buzzerLocked = true; // Lock them until host drops a new question

            io.emit('state_update', gameState); // Sync changes to all screens
        }
    });

    socket.on('disconnect', () => {
        console.log(`Device disconnected: ${socket.id}`)
        // Clean up player if they leave
        if (gameState.players[socket.id]) {
            delete gameState.players[socket.id]
            io.emit('state_update', gameState)
        }
    })
})

server.listen(3000, '0.0.0.0', () => {
    console.log('Server is running! Access it via http://localhost:3000')
})