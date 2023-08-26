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
  messages: Vec<string>; // Array of message IDs
  createdAt: nat64; // Timestamp of when the game was created
  updatedAt: Opt<nat64>; // Optional timestamp of when the game was last updated
}>;

type GamePayload = Record<{
  title: string; // Title of the game
  description: string; // Description of the game
  avatar: string; // URL of the game's avatar image
}>;

const gameStorage = new StableBTreeMap<string, Game>(0, 44, 1024);

$update;
export function addGame(payload: GamePayload): Result<Game, string> {
  if (!payload.title || !payload.description || !payload.avatar) {
    return Result.Err("Invalid payload");
  }

  const game: Game = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    owner: ic.caller(),
    members: [ic.caller()],
    messages: [],
    ...payload,
  };

  try {
    gameStorage.insert(game.id, game);
    return Result.Ok(game);
  } catch (error) {
    return Result.Err("Failed to add game");
  }
}

$update;
export function updateGame(
  id: string,
  payload: GamePayload
): Result<Game, string> {
  if (!payload.title || !payload.description || !payload.avatar) {
    return Result.Err("Invalid payload");
  }

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

$update;
export function addMembersToGame(
  id: string,
  member: Principal
): Result<Game, string> {
  return match(gameStorage.get(id), {
    Some: (game: Game) => {
      if (ic.caller().toString() !== game.owner.toString()) {
        return Result.Err<Game, string>(`You are not the owner of the game.`);
      }

      if (game.members.includes(member)) {
        return Result.Err<Game, string>(
          `Member is already a member of the game.`
        );
      }

      const updatedMembers = [...game.members, member];
      game.members = updatedMembers;
      gameStorage.insert(game.id, game);
      return Result.Ok<Game, string>(game);
    },
    None: () =>
      Result.Err<Game, string>(
        `Couldn't update a game with id=${id}. Game not found.`
      ),
  });
}

$update;
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
        `Couldn't delete a game with id=${id}. Game not found.`
      );
    },
  });
}

$update;
export function sendMessage(
  gameId: string,
  setMessage: string
): Result<Game, string> {
  return match(gameStorage.get(gameId), {
    Some: (game) => {
      const isMember = game.members
        .map(String)
        .includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Game, string>(`You don't belong to this game.`);
      }

      const message = { sender: ic.caller(), id: uuidv4(), setMessage };

      const updatedGame = { ...game };
      updatedGame.messages.push(message.id);
      gameStorage.insert(updatedGame.id, updatedGame);
      return Result.Ok<Game, string>(updatedGame);
    },
    None: () =>
      Result.Err<Game, string>(`A game with id=${gameId} was not found.`),
  });
}

$query;
export function getMessagesForGame(
  gameId: string
): Result<Vec<string>, string> {
  return match(gameStorage.get(gameId), {
    Some: (game: Game) => {
      const isMember = game.members
        .map(String)
        .includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Vec<string>, string>(
          `You don't belong to this game.`
        );
      }

      return Result.Ok<Vec<string>, string>(game.messages);
    },

    None: () =>
      Result.Err<Vec<string>, string>(
        `A game with id=${gameId} was not found.`
      ),
  });
}

$update;
export function deleteMessage(
  gameId: string,
  messageId: string
): Result<string, string> {
  return match(gameStorage.get(gameId), {
    Some: (game: Game) => {
      if (ic.caller().toString() !== game.owner.toString()) {
        return Result.Err<string, string>(
          `You are not authorized to delete this message.`
        );
      }
      game.messages = game.messages.filter((message) => message !== messageId);
      return Result.Ok<string, string>(
        `Message ${messageId} deleted successfully`
      );
    },
    None: () => {
      return Result.Err<string, string>(`Game with id=${gameId} not found.`);
    },
  });
}

globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};

