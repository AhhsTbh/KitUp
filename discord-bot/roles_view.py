"""The self-assign role buttons in #pick-roles.

setup_server.py posts the message; bot.py keeps the buttons working after
restarts (persistent view: fixed custom_ids, no timeout).
"""

import discord

import kitup_common as K

# key: (role name, emoji, colour)
SELF_ROLES = {
    "pc": ("PC", "🖥️", K.ADJUST),
    "ps": ("PlayStation", "🎮", 0x5B7FD6),
    "xbox": ("Xbox", "🟩", K.BUFF),
    "mp": ("Multiplayer", "🎯", K.ACCENT),
    "dmz": ("DMZ", "☢️", 0xC9A34A),
    "wz": ("Warzone", "🪂", K.NERF),
    "patch": ("Patch Alerts", "📋", K.ACCENT_TEXT),
    "meta": ("Meta Alerts", "📈", K.GOLD),
}


class RoleButton(discord.ui.Button):
    def __init__(self, key, row):
        label, emoji, _ = SELF_ROLES[key]
        super().__init__(label=label, emoji=emoji, style=discord.ButtonStyle.secondary,
                         custom_id=f"kitup:role:{key}", row=row)
        self.key = key

    async def callback(self, interaction: discord.Interaction):
        name = SELF_ROLES[self.key][0]
        role = discord.utils.get(interaction.guild.roles, name=name)
        if role is None:
            return await interaction.response.send_message(
                f"The **{name}** role is missing. Ask HQ to rerun the setup.", ephemeral=True)
        member = interaction.user
        try:
            if role in member.roles:
                await member.remove_roles(role, reason="Kit Up role picker")
                msg = f"Dropped **{name}**."
            else:
                await member.add_roles(role, reason="Kit Up role picker")
                msg = f"Added **{name}**. {SELF_ROLES[self.key][1]}"
        except discord.Forbidden:
            msg = "I can't hand out that role. HQ needs to move my role above it."
        await interaction.response.send_message(msg, ephemeral=True)


class RoleView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        for row, keys in enumerate((("pc", "ps", "xbox"), ("mp", "dmz", "wz"), ("patch", "meta"))):
            for k in keys:
                self.add_item(RoleButton(k, row))
