#pragma once

#include <string>
#include <landstalker_lib/md_tools.hpp>

class World;

void export_blocksets_as_csv(const World& world, const std::string& directory);
void export_map_palettes_as_csv(const World& world, const std::string& directory);
void export_tilesets(const md::ROM& rom, const std::string& directory);
void export_maps(md::ROM& rom, const World& world, const std::string& directory);