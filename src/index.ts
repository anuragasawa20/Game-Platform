import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
  Principal,
} from "azle";
import { v4 as uuidv4 } from "uuid";

type Game = Record<{
  id: string; // Unique identifier for the game
  title: string; // Title of the game
  description: string; // Description of the game
  avatar: string; // URL of the game's avatar image
  owner: Principal; // Owner of the game
  members: Vec<Principal>; // Array of game members
  createdAt: nat64; // Timestamp of when the game was created
  updatedAt: Opt<nat64>; // Optional timestamp of when the game was last updated
}>;

type GamePayload = Record<{
  title: string; // Title of the game
  description: string; // Description of the game
  avatar: string; // URL of the game's avatar image
}>;

type Message = Record<{
  id: string;
  content: string;
  sender: string;
}>;

const gameStorage = new StableBTreeMap<string, Game>(0, 44, 1024);

export function addGame(payload: GamePayload): Result<Game, string> {
  const game: Game = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    owner: ic.caller(),
    members: [ic.caller()],
    ...payload,
  };

  gameStorage.insert(game.id, game);
  return Result.Ok(game);
}

export function updateGame(
  id: string,
  payload: GamePayload
): Result<Game, string> {
  return match(gameStorage.get(id), {
    Some: (game: Game) => {
      if (ic.caller().toString() !== game.owner.toString()) {
        return Result.Err<Game, string>(
          `You are not authorized to update the game.`
        );
      }

      const updatedGame: Game = {
        ...game,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };
      gameStorage.insert(game.id, updatedGame);
      return Result.Ok<Game, string>(updatedGame);
    },
    None: () =>
      Result.Err<Game, string>(
        `Couldn't update a game with id=${id}. Game not found.`
      ),
  });
}

export function addMembersToGame(
  id: string,
  member: Principal
): Result<Game, string> {
  return match(gameStorage.get(id), {
    Some: (game: Game) => {
      if (ic.caller().toString() !== game.owner.toString()) {
        return Result.Err<Game, string>(`You are not the owner of the game.`);
      }

      game.members.push(member);
      gameStorage.insert(game.id, game);
      return Result.Ok<Game, string>(game);
    },
    None: () =>
      Result.Err<Game, string>(
        `Couldn't update a game with id=${id}. Game not found.`
      ),
  });
}

export function deleteGame(id: string): Result<string, string> {
  return match(gameStorage.get(id), {
    Some: (game: Game) => {
      if (ic.caller().toString() !== game.owner.toString()) {
        return Result.Err<string, string>(
          `You are not authorized to delete the game.`
        );
      }

      gameStorage.remove(id);
      return Result.Ok<string, string>(`Game deleted successfully.`);
    },
    None: () => {
      return Result.Err<string, string>(
        `couldn't delete a game with id=${id}. game not found`
      );
    },
  });
}

$update;
// Send a message to a gaming Place
export function sendMessage(payload: GamePayload): Result<Game, string> {
  return match(gameStorage.get(payload.gameId), {
    Some: (game: game) => {
      // Confirm only members of game can call this function
      const isMember = game.members
        .map(String)
        .includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Game, string>(`You don't belong to this game.`);
      }

      const message = { sender: ic.caller(), id: uuidv4(), ...payload }; // Create the message payload
      gameStorage.insert(message.id, message); // Store the message in the message storage
      return Result.Ok<Game, string>(message);
    },
    None: () =>
      Result.Err<Game, string>(
        `A game with id=${payload.gameId} was not found.`
      ),
  });
}

$query;
// Retrieve messages for a game
export function getMessagesForGame(
  gameId: string
): Result<Vec<Message>, string> {
  return match(gameStorage.get(gameId), {
    Some: (game: Game) => {
      // Confirm only members of the game can call this function
      const isMember = game.members
        .map(String)
        .includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Message[], string>(`You don't belong to this game.`);
      }

      const messages = gameStorage.values(); // Get all the messages
      const returnedMessages: Message[] = [];

      for (const message of messages) {
        if (message.gameId === gameId) {
          returnedMessages.push(message); // Filter messages for that game only
        }
      }

      return Result.Ok<Message[], string>(returnedMessages);
    },
    None: () => {
      return Result.Err<Message[], string>(
        `A game with id=${gameId} was not found.`
      );
    },
  });
}

export function getMessagesForgame(gameId: string): Result<Vec<Game>, string> {
  return match(gameStorage.get(gameId), {
    Some: (game: game) => {
      // Confirm only members of game can call this function
      const isMember = game.members
        .map(String)
        .includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Game[], string>(`You don't belong to this game.`);
      }

      const messages = gameStorage.values(); // get all the messages
      const returnedMessages: Game[] = [];

      for (const message of messages) {
        if (message.gameId === gameId) {
          returnedMessages.push(message); // filter messages for that game only
        }
      }

      return Result.Ok<Game[], string>(returnedMessages);
    },
    None: () => {
      return Result.Err<Game[], string>(
        `A game with id=${gameId} was not found.`
      );
    },
  });
}

$update;
// Delete a message
export function deleteMessage(id: string): Result<string, string> {
  return match(gameStorage.get(id), {
    Some: (message: Message) => {
      // Confirm only the owner of the message can call this function
      if (ic.caller().toString() !== message.sender.toString()) {
        return Result.Err<string, string>(
          `You are not authorized to delete this message.`
        );
      }
      gameStorage.remove(id); // Remove the message from the message storage
      return Result.Ok<string, string>(`Message ${id} deleted successfully.`);
    },
    None: () => {
      return Result.Err<string, string>(
        `Couldn't delete a message with id=${id}. Message not found.`
      );
    },
  });
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
