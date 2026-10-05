import json
import random
import shlex
from pathlib import Path
from typing import Any

from endstone.command import Command, CommandSender
from endstone.event import PlayerDeathEvent, event_handler
from endstone.plugin import Plugin
from endstone.scoreboard import Criteria, DisplaySlot, ObjectiveSortOrder, RenderType


COLOR = "\u00a7"


class LuckyCloverArena(Plugin):
    api_version = "0.11"
    prefix = "LuckyCloverArena"
    authors = ["Mell"]
    version = "0.3.6"
    description = "Double-elimination arena controller for LuckyClover PvP events."

    commands = {
        "lcarena": {
            "description": "Manage LuckyClover PvP arena matches.",
            "usages": ["/lcarena [args: message]"],
            "permissions": ["luckyclover_arena.command.admin"],
        }
    }

    permissions = {
        "luckyclover_arena.command.admin": {
            "description": "Allow managing LuckyClover arena matches.",
            "default": "op",
        }
    }

    def on_enable(self) -> None:
        self.save_default_config()
        self.reload_all()
        self._board_page = "current"
        self._board_tick = 0
        self._last_entries: dict[str, set[str]] = {}
        self._last_boards: dict[str, tuple[tuple[str, int], ...]] = {}
        self._last_display_objective = ""
        self._ensure_objectives()
        self.register_events(self)
        self._sidebar_task = self.server.scheduler.run_task(
            self, self._sidebar_loop, delay=20, period=self._sidebar_refresh_ticks()
        )
        self.logger.info("LuckyClover-Arena enabled.")

    def on_disable(self) -> None:
        self.save_state()
        if hasattr(self, "_sidebar_task"):
            self._sidebar_task.cancel()

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if command.name != "lcarena":
            return False
        args = self.normalize_args(args)
        if not args:
            self.send_help(sender)
            return True

        sub = args[0].lower()
        rest = args[1:]

        if sub == "reload":
            self.reload_all()
            self._ensure_objectives()
            sender.send_message(f"{COLOR}aLuckyClover-Arena 配置已重载。")
            return True
        if sub in {"begin", "generate"}:
            self.begin_tournament(sender)
            return True
        if sub == "list":
            self.cmd_list(sender)
            return True
        if sub == "current":
            self.cmd_current(sender)
            return True
        if sub == "next":
            self.cmd_next(sender)
            return True
        if sub == "win":
            if not rest:
                sender.send_message(f"{COLOR}c用法: /lcarena win <玩家名> [积分]")
                return True
            player = rest[0]
            points = self._parse_points(rest[1:], self.tournament_config().get("score_per_win", 1))
            self.record_win(sender, player, points)
            return True
        if sub == "score":
            if not rest:
                sender.send_message(f"{COLOR}c用法: /lcarena score <玩家名> [积分]")
                return True
            player = rest[0]
            points = self._parse_points(rest[1:], self.tournament_config().get("score_per_manual_add", 1))
            self.add_score(player, points)
            sender.send_message(f"{COLOR}a已给 {player} 增加 {points} 分。")
            return True
        if sub == "board":
            if not rest or rest[0].lower() not in {"on", "off"}:
                sender.send_message(f"{COLOR}c用法: /lcarena board <on|off>")
                return True
            self.state["sidebar_enabled"] = rest[0].lower() == "on"
            self.save_state()
            sender.send_message(f"{COLOR}a侧边栏已{('开启' if self.state['sidebar_enabled'] else '关闭')}。")
            return True
        if sub == "reset":
            self.state = self.default_state()
            self.save_state()
            self.clear_boards()
            sender.send_message(f"{COLOR}a赛程、积分和当前比赛已清空。")
            return True

        self.send_help(sender)
        return True

    def normalize_args(self, args: list[str]) -> list[str]:
        if len(args) != 1:
            return args
        try:
            return shlex.split(args[0])
        except ValueError:
            return args[0].split()

    def reload_all(self) -> None:
        self.reload_config()
        self.state_path = Path(self.data_folder) / "state.json"
        self.state = self.load_state()

    def default_state(self) -> dict[str, Any]:
        return {
            "started": False,
            "finished": False,
            "champion": "",
            "players": [],
            "scores": {},
            "losses": {},
            "eliminated": [],
            "current_match": None,
            "winners_pending": [],
            "winners_next": [],
            "losers_pending": [],
            "losers_pool": [],
            "winners_champion": "",
            "losers_champion": "",
            "final_wins": {},
            "w_round": 1,
            "l_round": 1,
            "f_game": 1,
            "next_match_no": 1,
            "last_winner": "",
            "last_match_players": [],
            "losers_waiting_for_w_drop": False,
            "sidebar_enabled": True,
        }

    def load_state(self) -> dict[str, Any]:
        if not self.state_path.exists():
            return self.default_state()
        try:
            with self.state_path.open("r", encoding="utf-8") as f:
                loaded = json.load(f)
        except (OSError, json.JSONDecodeError):
            self.logger.warning("state.json is invalid; using empty state.")
            return self.default_state()
        state = self.default_state()
        state.update(loaded)
        state["scores"] = {str(k): int(v) for k, v in state.get("scores", {}).items()}
        state["losses"] = {str(k): int(v) for k, v in state.get("losses", {}).items()}
        state["final_wins"] = {str(k): int(v) for k, v in state.get("final_wins", {}).items()}
        return state

    def save_state(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.state_path.open("w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)
            f.write("\n")

    def tournament_config(self) -> dict[str, Any]:
        return dict(self.config.get("tournament", {}))

    def configured_players(self) -> list[str]:
        seen = set()
        players = []
        for player in self.tournament_config().get("players", []):
            name = str(player).strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                players.append(name)
        return players

    def begin_tournament(self, sender: CommandSender) -> None:
        players = self.configured_players()
        if len(players) < 2:
            sender.send_message(f"{COLOR}c至少需要在 config.toml 里配置 2 名玩家。")
            return

        cfg = self.tournament_config()
        if cfg.get("shuffle", True):
            seed = str(cfg.get("seed", "")).strip()
            rng = random.Random(seed or None)
            rng.shuffle(players)

        self.state = self.default_state()
        self.state["started"] = True
        self.state["players"] = players
        self.state["scores"] = {player: 0 for player in players}
        self.state["losses"] = {player: 0 for player in players}
        self.state["winners_pending"] = self.make_round_matches(players, "W", 1)
        self.save_state()
        self.broadcast(f"{COLOR}6[PvP] {COLOR}a双败淘汰赛已生成，共 {len(players)} 名选手。")
        self.broadcast(f"{COLOR}7赛制：每人两次机会，败者进入败者组；决赛三局两胜。")
        sender.send_message(f"{COLOR}a使用 /lcarena next 开始第一场。")

    @event_handler
    def on_player_death(self, event: PlayerDeathEvent) -> None:
        if not self.tournament_config().get("auto_death_judge", True):
            return
        match = self.state.get("current_match")
        if not match or self.state.get("finished"):
            return
        players = list(match.get("players", []))
        if len(players) != 2:
            return

        player = getattr(event, "player", None)
        dead_name = getattr(player, "name", "") if player is not None else ""
        dead_name = self.match_player_name(str(dead_name), players)
        if dead_name is None:
            return

        winner = players[0] if players[1] == dead_name else players[1]
        points = int(self.tournament_config().get("score_per_win", 1))
        self.broadcast(f"{COLOR}6[PvP] {COLOR}c{dead_name} 死亡，{COLOR}e{winner}{COLOR}a 自动获胜。")
        self.apply_match_result(winner, points)

    def make_round_matches(self, players: list[str], bracket: str, round_no: int) -> list[dict[str, Any]]:
        pending = []
        pool = list(players)
        if len(pool) % 2 == 1:
            bye = pool.pop()
            if bracket == "W":
                self.state["winners_next"].append(bye)
                self.broadcast(f"{COLOR}7[PvP] {bye} 胜者组轮空。")
            else:
                self.state["losers_pool"].append(bye)
                self.broadcast(f"{COLOR}7[PvP] {bye} 败者组轮空。")

        for index in range(0, len(pool), 2):
            p1 = pool[index]
            p2 = pool[index + 1]
            match_no = int(self.state.get("next_match_no", 1))
            self.state["next_match_no"] = match_no + 1
            bracket_name = "胜者组" if bracket == "W" else "败者组"
            pending.append(
                {
                    "id": f"{bracket.lower()}{round_no}-{(index // 2) + 1}",
                    "no": match_no,
                    "bracket": bracket,
                    "round": round_no,
                    "name": f"{bracket_name} R{round_no}-{(index // 2) + 1}",
                    "players": [p1, p2],
                    "sides": [
                        {"name": "A 方", "slot": "side_a", "players": [p1]},
                        {"name": "B 方", "slot": "side_b", "players": [p2]},
                    ],
                }
            )
        return pending

    def cmd_next(self, sender: CommandSender) -> None:
        if not self.state.get("started"):
            sender.send_message(f"{COLOR}e请先执行 /lcarena begin 生成赛程。")
            return
        if self.state.get("finished"):
            sender.send_message(f"{COLOR}a比赛已经结束，冠军是 {self.state.get('champion')}。")
            return
        if self.state.get("current_match"):
            sender.send_message(f"{COLOR}e当前比赛还没判胜，请先使用 /lcarena win <玩家名>。")
            return

        match = self.next_match()
        if match is None:
            sender.send_message(f"{COLOR}e暂时没有可进行的下一场。")
            return
        self.state["current_match"] = match
        self.save_state()
        self.run_match_start_commands(match)
        self.send_previous_non_match_players_to_standby(match)
        self.teleport_match(match)
        self.announce_match(match)

    def next_match(self) -> dict[str, Any] | None:
        while True:
            if self.state["winners_pending"]:
                return self.state["winners_pending"].pop(0)
            if self.state["losers_pending"]:
                return self.state["losers_pending"].pop(0)
            can_pair_losers = (
                len(self.state["losers_pool"]) >= 2
                and (
                    self.state.get("winners_champion")
                    or not self.state.get("losers_waiting_for_w_drop", False)
                )
            )
            if can_pair_losers:
                round_no = int(self.state.get("l_round", 1))
                players = self.state["losers_pool"]
                self.state["losers_pool"] = []
                self.state["losers_pending"] = self.make_round_matches(players, "L", round_no)
                self.state["l_round"] = round_no + 1
                if not self.state.get("winners_champion"):
                    self.state["losers_waiting_for_w_drop"] = True
                continue
            if not self.state.get("winners_champion"):
                if len(self.state["winners_next"]) >= 2:
                    round_no = int(self.state.get("w_round", 1)) + 1
                    players = self.state["winners_next"]
                    self.state["winners_next"] = []
                    self.state["winners_pending"] = self.make_round_matches(players, "W", round_no)
                    self.state["w_round"] = round_no
                    continue
                if len(self.state["winners_next"]) == 1:
                    self.state["winners_champion"] = self.state["winners_next"].pop()
                    self.broadcast(f"{COLOR}6[PvP] {COLOR}e{self.state['winners_champion']} {COLOR}a进入总决赛。")
                    continue
            if self.state.get("winners_champion") and not self.state.get("losers_champion"):
                if len(self.state["losers_pool"]) == 1:
                    self.state["losers_champion"] = self.state["losers_pool"].pop()
                    self.broadcast(f"{COLOR}6[PvP] {COLOR}e{self.state['losers_champion']} {COLOR}a从败者组杀入总决赛。")
                    continue
            if self.state.get("winners_champion") and self.state.get("losers_champion"):
                return self.next_final_match()
            return None

    def next_final_match(self) -> dict[str, Any] | None:
        needed = int(self.tournament_config().get("final_best_of", 3)) // 2 + 1
        wins = self.state.setdefault("final_wins", {})
        p1 = self.state["winners_champion"]
        p2 = self.state["losers_champion"]
        if int(wins.get(p1, 0)) >= needed or int(wins.get(p2, 0)) >= needed:
            return None
        game = int(self.state.get("f_game", 1))
        return {
            "id": f"final-{game}",
            "no": int(self.state.get("next_match_no", 1)),
            "bracket": "F",
            "round": game,
            "name": f"总决赛 第 {game} 局",
            "players": [p1, p2],
            "sides": [
                {"name": "胜者组冠军", "slot": "side_a", "players": [p1]},
                {"name": "败者组冠军", "slot": "side_b", "players": [p2]},
            ],
        }

    def record_win(self, sender: CommandSender, winner: str, points: int) -> None:
        match = self.state.get("current_match")
        if not match:
            sender.send_message(f"{COLOR}e当前没有进行中的比赛。")
            return
        players = list(match.get("players", []))
        actual_winner = self.match_player_name(winner, players)
        if actual_winner is None:
            sender.send_message(f"{COLOR}c{winner} 不在当前比赛中。当前选手：{', '.join(players)}")
            return
        self.apply_match_result(actual_winner, points)
        sender.send_message(f"{COLOR}a已记录胜者。使用 /lcarena next 进入下一场。")

    def apply_match_result(self, actual_winner: str, points: int) -> None:
        match = self.state.get("current_match")
        if not match:
            return
        players = list(match.get("players", []))
        if len(players) != 2 or actual_winner not in players:
            return
        loser = players[0] if players[1] == actual_winner else players[1]
        self.add_score(actual_winner, points)
        self.state["last_winner"] = actual_winner
        bracket = match.get("bracket", "")
        if bracket == "F":
            self.record_final_win(actual_winner, loser, points)
            return

        self.state["last_match_players"] = players
        losses = self.state.setdefault("losses", {})
        losses[loser] = int(losses.get(loser, 0)) + 1
        if bracket == "W":
            self.state["winners_next"].append(actual_winner)
            self.state["losers_waiting_for_w_drop"] = False
        elif bracket == "L":
            self.state["losers_pool"].append(actual_winner)

        self.broadcast(
            f"{COLOR}6[PvP] {COLOR}e{actual_winner}{COLOR}a 战胜 {COLOR}c{loser}"
            f"{COLOR}7（{self.bracket_name(bracket)}，{loser} 当前 {losses[loser]} 败）"
        )
        if losses[loser] >= 2:
            self.state["eliminated"].append(loser)
            self.broadcast(f"{COLOR}c[PvP] {loser} 已两败淘汰。")
        else:
            self.state["losers_pool"].append(loser)
            self.broadcast(f"{COLOR}e[PvP] {loser} 进入败者组，还有一次机会。")

        self.state["current_match"] = None
        self.save_state()

    def record_final_win(self, winner: str, loser: str, points: int) -> None:
        needed = int(self.tournament_config().get("final_best_of", 3)) // 2 + 1
        wins = self.state.setdefault("final_wins", {})
        wins[winner] = int(wins.get(winner, 0)) + 1
        wins.setdefault(loser, int(wins.get(loser, 0)))
        self.broadcast(
            f"{COLOR}6[PvP] {COLOR}e{winner}{COLOR}a 赢下总决赛本局。"
            f"{COLOR}7 当前比分：{winner} {wins[winner]} - {wins[loser]} {loser}"
        )
        if wins[winner] >= needed:
            self.state["last_match_players"] = [winner, loser]
            self.state["current_match"] = None
            self.state["finished"] = True
            self.state["champion"] = winner
            self.broadcast(f"{COLOR}6[PvP] {COLOR}l冠军：{COLOR}e{winner}{COLOR}r{COLOR}a！")
            self.run_finish_commands()
            self.broadcast_final_scores()
        else:
            match = self.state.get("current_match")
            if match:
                self.state["last_match_players"] = list(match.get("players", []))
                self.schedule_match_reset_commands(match)
            self.state["current_match"] = None
            self.state["f_game"] = int(self.state.get("f_game", 1)) + 1
            self.state["next_match_no"] = int(self.state.get("next_match_no", 1)) + 1
            self.broadcast(f"{COLOR}7[PvP] 使用 /lcarena next 开始总决赛下一局。")
        self.save_state()

    def match_player_name(self, name: str, candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate.lower() == name.lower():
                return candidate
        return None

    def cmd_list(self, sender: CommandSender) -> None:
        sender.send_message(f"{COLOR}6LuckyClover 双败赛程：")
        sender.send_message(f"{COLOR}e胜者组待赛: {len(self.state.get('winners_pending', []))}")
        sender.send_message(f"{COLOR}e败者组待赛: {len(self.state.get('losers_pending', []))}")
        sender.send_message(f"{COLOR}e败者组池: {', '.join(self.state.get('losers_pool', [])) or '空'}")
        sender.send_message(f"{COLOR}e胜者组下一轮: {', '.join(self.state.get('winners_next', [])) or '空'}")
        sender.send_message(f"{COLOR}e胜者组冠军: {self.state.get('winners_champion') or '未产生'}")
        sender.send_message(f"{COLOR}e败者组冠军: {self.state.get('losers_champion') or '未产生'}")

    def cmd_current(self, sender: CommandSender) -> None:
        match = self.state.get("current_match")
        if not match:
            sender.send_message(f"{COLOR}e当前没有比赛。使用 /lcarena next。")
            return
        sender.send_message(f"{COLOR}6当前比赛: {COLOR}f{match.get('name', '')}")
        for side in match.get("sides", []):
            sender.send_message(
                f"{COLOR}b{side.get('name', 'Side')}: {COLOR}f{', '.join(side.get('players', []))}"
            )

    def teleport_match(self, match: dict[str, Any]) -> None:
        pre_match_commands = list(self.config.get("arena", {}).get("pre_match", {}).get("commands", []))
        equipment_commands = list(self.config.get("equipment", {}).get("commands", []))
        for side in match.get("sides", []):
            slot = side.get("slot", "side_a")
            slot_commands = list(self.config.get("arena", {}).get(slot, {}).get("commands", []))
            players = list(side.get("players", []))
            for player in players:
                for template in pre_match_commands + equipment_commands + slot_commands:
                    command = self.format_command(template, player, match, side)
                    self.dispatch(command)
                    if self.tournament_config().get("announce_commands", True):
                        self.logger.info(f"Dispatched: {command}")

    def schedule_respawn_commands(self, player: str, match: dict[str, Any]) -> None:
        respawn = dict(self.config.get("arena", {}).get("respawn", {}))
        side = self.find_player_side(player, match)
        slot = str(side.get("slot", ""))
        commands = list(respawn.get(slot, {}).get("commands", []))
        if not commands:
            commands = list(respawn.get("commands", []))
        if not commands:
            return
        delay = max(1, int(respawn.get("delay_ticks", 40)))

        def run_commands() -> None:
            for template in commands:
                command = self.format_command(template, player, match, side)
                self.dispatch(command)
                if self.tournament_config().get("announce_commands", True):
                    self.logger.info(f"Dispatched respawn: {command}")

        self.server.scheduler.run_task(self, run_commands, delay=delay)

    def schedule_match_reset_commands(self, match: dict[str, Any]) -> None:
        for player in match.get("players", []):
            self.schedule_respawn_commands(player, match)

    def run_match_start_commands(self, match: dict[str, Any]) -> None:
        commands = list(self.config.get("arena", {}).get("match_start", {}).get("commands", []))
        if not commands:
            return
        side = {"name": "开场", "players": list(match.get("players", []))}
        context_player = str(match.get("players", [""])[0]) if match.get("players") else ""
        for template in commands:
            command = self.format_command(template, context_player, match, side)
            self.dispatch(command)
            if self.tournament_config().get("announce_commands", True):
                self.logger.info(f"Dispatched match start: {command}")

    def run_finish_commands(self) -> None:
        commands = list(self.config.get("arena", {}).get("finish", {}).get("commands", []))
        commands += list(self.config.get("arena", {}).get("standby", {}).get("commands", []))
        if not commands:
            return
        for player in self.state.get("players", []):
            for template in commands:
                command = self.format_command(template, player, {}, {"name": "结束", "players": [player]})
                self.dispatch(command)
                if self.tournament_config().get("announce_commands", True):
                    self.logger.info(f"Dispatched finish: {command}")

    def send_previous_non_match_players_to_standby(self, match: dict[str, Any]) -> None:
        commands = list(self.config.get("arena", {}).get("standby", {}).get("commands", []))
        if not commands:
            return
        active = {str(player).lower() for player in match.get("players", [])}
        side = {"name": "待命", "players": []}
        for player in self.state.get("last_match_players", []):
            if str(player).lower() in active:
                continue
            if self.find_online_player(player) is None:
                continue
            for template in commands:
                command = self.format_command(template, player, match, side)
                self.dispatch(command)
                if self.tournament_config().get("announce_commands", True):
                    self.logger.info(f"Dispatched standby: {command}")

    def find_player_side(self, player: str, match: dict[str, Any]) -> dict[str, Any]:
        for side in match.get("sides", []):
            for candidate in side.get("players", []):
                if candidate.lower() == player.lower():
                    return dict(side)
        return {"name": "", "slot": "", "players": [player]}

    def announce_match(self, match: dict[str, Any]) -> None:
        sides = []
        for side in match.get("sides", []):
            names = ", ".join(side.get("players", []))
            sides.append(f"{side.get('name', 'Side')}({names})")
        self.broadcast(
            f"{COLOR}6[PvP] {COLOR}a下一场：{COLOR}e{match.get('name')}"
            f"{COLOR}7 - {COLOR}f{' vs '.join(sides)}"
        )

    def add_score(self, player: str, points: int) -> None:
        scores = self.state.setdefault("scores", {})
        scores[player] = int(scores.get(player, 0)) + points
        self.save_state()

    def bracket_name(self, bracket: str) -> str:
        return {"W": "胜者组", "L": "败者组", "F": "总决赛"}.get(bracket, "比赛")

    def format_command(
        self, template: str, player: str, match: dict[str, Any], side: dict[str, Any]
    ) -> str:
        escaped_player = player.replace("\\", "\\\\").replace('"', '\\"')
        opponent = ""
        for candidate in match.get("players", []):
            if candidate != player:
                opponent = candidate
                break
        return template.format(
            player=escaped_player,
            raw_player=player,
            opponent=opponent,
            match_id=match.get("id", ""),
            match_name=match.get("name", ""),
            match_no=match.get("no", ""),
            bracket=self.bracket_name(str(match.get("bracket", ""))),
            side=side.get("name", ""),
        )

    def _parse_points(self, args: list[str], default: int) -> int:
        if not args:
            return int(default)
        try:
            return int(args[0])
        except ValueError:
            return int(default)

    def send_help(self, sender: CommandSender) -> None:
        sender.send_message(f"{COLOR}6LuckyClover-Arena 命令：")
        sender.send_message(f"{COLOR}e/lcarena begin {COLOR}7- 从配置名单生成双败赛程")
        sender.send_message(f"{COLOR}e/lcarena next {COLOR}7- 传送下一场选手")
        sender.send_message(f"{COLOR}e/lcarena win <玩家名> [积分] {COLOR}7- 记录胜者并推进赛程")
        sender.send_message(f"{COLOR}e/lcarena score <玩家名> [积分] {COLOR}7- 手动加分")
        sender.send_message(f"{COLOR}e/lcarena list/current/reload/board/reset")

    def broadcast(self, message: str) -> None:
        self.server.broadcast_message(message)

    def _sidebar_refresh_ticks(self) -> int:
        sidebar = self.config.get("sidebar", {})
        return max(20, int(sidebar.get("refresh_ticks", 40)))

    def _ensure_objectives(self) -> None:
        sidebar = self.config.get("sidebar", {})
        self.get_or_create_objective(
            sidebar.get("objective_current", "lc_arena_cur"),
            sidebar.get("current_title", "LuckyClover PvP"),
        )
        self.get_or_create_objective(
            sidebar.get("objective_ranking", "lc_arena_rank"),
            sidebar.get("ranking_title", "PvP Ranking"),
        )
        health_objective = self.get_or_create_objective(
            sidebar.get("objective_health", "lc_arena_hp"),
            sidebar.get("health_title", "HP"),
            RenderType.HEARTS,
        )
        if health_objective is not None:
            health_objective.set_display(DisplaySlot.BELOW_NAME, ObjectiveSortOrder.ASCENDING)

    def _sidebar_loop(self) -> None:
        sidebar = self.config.get("sidebar", {})
        if not sidebar.get("enabled", True) or not self.state.get("sidebar_enabled", True):
            return
        self._board_tick += self._sidebar_refresh_ticks()
        rotate_ticks = max(20, int(sidebar.get("rotate_ticks", 160)))
        if self._board_tick >= rotate_ticks:
            self._board_tick = 0
            self._board_page = "ranking" if self._board_page == "current" else "current"
        if self._board_page == "current":
            self.show_current_board()
        else:
            self.show_ranking_board()
        self.update_below_name_health()

    def show_current_board(self) -> None:
        sidebar = self.config.get("sidebar", {})
        objective = sidebar.get("objective_current", "lc_arena_cur")
        match = self.state.get("current_match")
        lines = [f"{COLOR}6当前比赛"]
        if self.state.get("finished"):
            lines.append(f"{COLOR}e冠军")
            lines.append(f"{COLOR}f{self.state.get('champion', '')}")
        elif match:
            lines.append(f"{COLOR}e{match.get('name', '')}")
            for side in match.get("sides", []):
                for player in side.get("players", []):
                    loss = int(self.state.get("losses", {}).get(player, 0))
                    lines.append(f"{COLOR}f{player} {COLOR}7({loss}败)")
        else:
            lines.append(f"{COLOR}7等待下一场")
            lines.append(f"{COLOR}f/lcarena next")
        winner = self.state.get("last_winner", "")
        if winner:
            lines.append(f"{COLOR}a上场胜者: {winner}")
        self.write_board(objective, lines[:15])

    def show_ranking_board(self) -> None:
        sidebar = self.config.get("sidebar", {})
        objective = sidebar.get("objective_ranking", "lc_arena_rank")
        size = max(1, int(sidebar.get("ranking_size", 10)))
        scores = sorted(
            self.state.get("scores", {}).items(), key=lambda item: (-int(item[1]), item[0].lower())
        )
        if not scores:
            self.write_board(objective, [(f"{COLOR}7暂无积分", 0)])
            return
        entries = [
            (self.ranking_entry(index, player), int(score))
            for index, (player, score) in enumerate(scores[:size], start=1)
        ]
        self.write_board(objective, entries)

    def write_board(self, objective: str, lines: list[str] | list[tuple[str, int]]) -> None:
        entries_with_scores = self.normalize_board_lines(lines)
        signature = tuple(entries_with_scores)
        if (
            self._last_boards.get(objective) == signature
            and self._last_display_objective == objective
        ):
            return

        board_objective = self.recreate_objective(objective)
        if board_objective is None:
            return

        entries: set[str] = set()
        for line, score in entries_with_scores:
            entry = self.unique_entry(line, entries)
            entries.add(entry)
            board_objective.get_score(entry).value = score
        board_objective.set_display(DisplaySlot.SIDE_BAR, ObjectiveSortOrder.DESCENDING)
        self._last_entries[objective] = entries
        self._last_boards[objective] = signature
        self._last_display_objective = objective

    def normalize_board_lines(self, lines: list[str] | list[tuple[str, int]]) -> list[tuple[str, int]]:
        if not lines:
            return []
        if isinstance(lines[0], tuple):
            return [(str(line), int(score)) for line, score in lines]  # type: ignore[misc]
        total = len(lines)
        return [(str(line), total - idx) for idx, line in enumerate(lines)]  # type: ignore[arg-type]

    def ranking_entry(self, index: int, player: str) -> str:
        prefix = f"{COLOR}e{index}. {COLOR}f"
        max_player_len = max(1, 36 - len(prefix))
        return prefix + player[:max_player_len]

    def player_health_text(self, name: str) -> str:
        player = self.find_online_player(name)
        if player is None:
            return "离线"
        health = self.read_numeric_attr(player, "health")
        max_health = self.read_numeric_attr(player, "max_health")
        if health is None:
            return "HP?"
        health_text = str(max(0, int(round(health))))
        if max_health is not None:
            return f"{health_text}/{max(1, int(round(max_health)))}❤"
        return f"{health_text}❤"

    def player_health_score(self, name: str) -> int | None:
        player = self.find_online_player(name)
        if player is None:
            return None
        health = self.read_numeric_attr(player, "health")
        if health is None:
            return None
        return max(0, int(round(health)))

    def update_below_name_health(self) -> None:
        sidebar = self.config.get("sidebar", {})
        if not sidebar.get("health_below_name", True):
            return
        objective_name = sidebar.get("objective_health", "lc_arena_hp")
        objective = self.get_or_create_objective(
            objective_name,
            sidebar.get("health_title", "HP"),
            RenderType.HEARTS,
        )
        if objective is None:
            return
        objective.set_display(DisplaySlot.BELOW_NAME, ObjectiveSortOrder.ASCENDING)

        for online_player in self.server.online_players:
            player_name = online_player.name
            score = self.player_health_score(player_name)
            if score is not None:
                objective.get_score(online_player).value = score

    def find_online_player(self, name: str):
        target = name.lower()
        for player in self.server.online_players:
            if player.name.lower() == target:
                return player
        return None

    def read_numeric_attr(self, obj: Any, attr: str) -> float | None:
        value = getattr(obj, attr, None)
        if callable(value):
            value = value()
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def unique_entry(self, line: str, existing: set[str]) -> str:
        entry = line[:36]
        suffix_count = 0
        while entry in existing:
            suffix_count += 1
            suffix = COLOR + "r" * suffix_count
            entry = line[: max(0, 36 - len(suffix))] + suffix
        return entry

    def clear_boards(self) -> None:
        for objective in list(self._last_entries):
            board_objective = self.find_objective(objective)
            if board_objective is not None:
                board_objective.unregister()
        self._last_entries = {}
        self._last_boards = {}
        self._last_display_objective = ""

    def broadcast_final_scores(self) -> None:
        scores = sorted(
            self.state.get("scores", {}).items(), key=lambda item: (-int(item[1]), item[0].lower())
        )
        self.broadcast(f"{COLOR}6[PvP] {COLOR}a全部比赛已结束，最终积分如下：")
        if not scores:
            self.broadcast(f"{COLOR}7暂无积分。")
            return
        for index, (player, score) in enumerate(scores, start=1):
            loss = int(self.state.get("losses", {}).get(player, 0))
            suffix = " 冠军" if player == self.state.get("champion") else f" {loss}败"
            self.broadcast(f"{COLOR}e{index}. {COLOR}f{player} {COLOR}7- {COLOR}a{score} 分{COLOR}7 /{suffix}")

    def get_or_create_objective(
        self,
        name: str,
        display_name: str,
        render_type: RenderType = RenderType.INTEGER,
    ):
        objective = self.find_objective(name)
        if objective is not None:
            if getattr(objective, "render_type", None) == render_type:
                return objective
            objective.unregister()
        scoreboard = self.server.scoreboard
        if scoreboard is None:
            return None
        return scoreboard.add_objective(str(name), Criteria.DUMMY, str(display_name), render_type)

    def recreate_objective(self, name: str):
        sidebar = self.config.get("sidebar", {})
        display_names = {
            sidebar.get("objective_current", "lc_arena_cur"): sidebar.get(
                "current_title", "LuckyClover PvP"
            ),
            sidebar.get("objective_ranking", "lc_arena_rank"): sidebar.get(
                "ranking_title", "PvP Ranking"
            ),
        }
        old = self.find_objective(name)
        if old is not None:
            old.unregister()
        return self.get_or_create_objective(name, str(display_names.get(name, name)))

    def find_objective(self, name: str):
        scoreboard = self.server.scoreboard
        if scoreboard is None:
            return None
        try:
            return scoreboard.get_objective(str(name))
        except Exception:
            return None

    def reset_score(self, objective: str, entry: str) -> None:
        scoreboard = self.server.scoreboard
        if scoreboard is None:
            return
        objective_obj = self.find_objective(objective)
        try:
            scoreboard.reset_scores(entry, objective_obj)
        except TypeError:
            try:
                scoreboard.reset_scores(entry)
            except Exception:
                pass
        except Exception:
            pass

    def dispatch(self, command: str) -> None:
        self.server.dispatch_command(self.server.command_sender, command)
