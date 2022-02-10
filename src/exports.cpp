#include <filesystem>

#include <landstalker_lib/model/world.hpp>
#include <landstalker_lib/model/map.hpp>
#include <landstalker_lib/model/entity.hpp>
#include <landstalker_lib/model/blockset.hpp>
#include <landstalker_lib/constants/offsets.hpp>
#include <landstalker_lib/tools/lz77.hpp>

#include <landstalker_lib/io/io.hpp>

#include <landstalker_lib/model/map_layout.hpp>
#include <landstalker_lib/model/map.hpp>

////////////////////////////////

void export_blocksets_as_csv(const World& world, const std::string& directory)
{
    std::filesystem::create_directory(directory);
    std::filesystem::create_directory(directory + "/renders/");

    for(uint32_t i=0 ; i<world.blockset_groups().size() ; ++i)
    {
        for(uint32_t j=0 ; j<world.blockset_groups()[i].size() ; ++j)
        {
            Blockset* blockset = world.blockset_groups()[i][j];

            std::string path = directory + "/blockset_" + std::to_string(i) + "_" + std::to_string(j) + ".csv";
            std::ofstream file(path);

            for(const Blockset::Block& block : blockset->blocks())
            {
                std::string line;
                line = block[0].to_csv() + ","
                       + block[1].to_csv() + ","
                       + block[2].to_csv() + ","
                       + block[3].to_csv();
                file << line << "\n";
            }

            file.close();
        }
    }
}

void export_map_palettes_as_csv(const World& world, const std::string& directory)
{
    std::filesystem::create_directory(directory);

    for(uint32_t i=0 ; i<world.map_palettes().size() ; ++i)
    {
        MapPalette* palette = world.map_palettes()[i];

        std::string path = directory + "/" + std::to_string(i) + ".csv";
        std::ofstream file(path);
        for(const Color& color : *palette)
        {
            uint8_t r = color.r() >> 4;
            uint8_t g = color.g() >> 4;
            uint8_t b = color.b() >> 4;
            file << "#ff" << std::hex << (uint16_t)r << (uint16_t)r << (uint16_t)g << (uint16_t)g << (uint16_t)b << (uint16_t)b << "\n";
        }
        file.close();
    }
}

void export_tilesets(const md::ROM& rom, const std::string& directory)
{
    std::filesystem::create_directory(directory);

    uint32_t tilesets_table_addr = rom.get_long(offsets::TILESETS_TABLE_POINTER);
    for(uint8_t i=0 ; i<0x20 ; ++i)
    {
        uint32_t tileset_addr = rom.get_long(tilesets_table_addr + (i*4));
        if(tileset_addr == 0xFFFFFFFF || tileset_addr == 0x00094F2A)
            continue;

        const uint8_t* it = rom.iterator_at(tileset_addr);
        std::vector<uint8_t> decoded_bytes = decode_lz77(it);

        std::string path = directory + "/" + std::to_string(i) + ".bin";
        std::ofstream file(path, std::ios::out | std::ios::binary);
        file.write((char*)&decoded_bytes[0], (std::streamsize)decoded_bytes.size());
        file.close();
    }
}

////////////////////////////////

static void export_layer_to_csv(const std::vector<uint16_t>& vec, uint8_t width, std::ofstream& file)
{
    uint8_t x = 0;
    for(uint16_t value : vec)
    {
        if(x == width)
        {
            x = 0;
            file << "\n";
        }
        else if(x > 0)
            file << ",";

        file << value;
        ++x;
    }
}

static void export_map_layout(MapLayout* layout, uint32_t size, const std::string& base_path, const std::string& suffix = "")
{
    std::ofstream fg_file(base_path + "foreground" + suffix + ".csv");
    export_layer_to_csv(layout->foreground_tiles(), layout->width(), fg_file);
    fg_file.close();

    std::ofstream bg_file(base_path + "background" + suffix + ".csv");
    export_layer_to_csv(layout->background_tiles(), layout->width(), bg_file);
    bg_file.close();

    std::ofstream heightmap_file(base_path + "heightmap" + suffix + ".csv");
    export_layer_to_csv(layout->heightmap(), layout->heightmap_width(), heightmap_file);
    heightmap_file.close();

    Json metadata;
    metadata["tilemap_offset_x"] = layout->left();
    metadata["tilemap_offset_y"] = layout->top();
    dump_json_to_file(metadata, base_path + "layout_metadata" + suffix + ".json");
}

static void export_map_metadata(const World& world, Map* map, const std::string& directory)
{
    Json map_metadata;

    std::pair<uint8_t, uint8_t> blockset_id = world.blockset_id(map->blockset());
    map_metadata["blockset_primary"] = blockset_id.first;
    map_metadata["blockset_secondary"] = blockset_id.second;
    map_metadata["palette_id"] = world.map_palette_id(map->palette());
    map_metadata["bgm"] = map->background_music();
    map_metadata["ceiling_height"] = map->room_height();
    map_metadata["base_chest_id"] = map->base_chest_id();
    map_metadata["unknown_param_1"] = map->unknown_param_1();
    map_metadata["unknown_param_2"] = map->unknown_param_2();
    map_metadata["climb_destination"] = map->climb_destination();
    map_metadata["fall_destination"] = map->fall_destination();
    map_metadata["flag_on_visit"] = std::to_string(map->visited_flag().byte) + ":" + std::to_string((uint16_t)map->visited_flag().bit);

    map_metadata["entities"] = Json::array();
    for(Entity* entity : map->entities())
    {
        Json entity_json = entity->to_json(world);
        entity_json["entityTypeId"] = entity->entity_type_id();
        map_metadata["entities"].emplace_back(entity_json);
    }

    // TODO: Support std::map<Map*, Flag> _variants;
    // TODO: Support std::vector<uint16_t> _speaker_ids;
    // TODO: Support std::vector<GlobalEntityMaskFlag> _global_entity_mask_flags;
    // TODO: Support std::vector<GlobalEntityMaskFlag> _key_door_mask_flags;

    std::string filename = std::to_string(map->id());
    while(filename.size() < 3)
        filename = "0" + filename;
    filename = "map_" + filename + ".lsmap";

    dump_json_to_file(map_metadata, directory + filename);
}

void export_maps(md::ROM& rom, const World& world, const std::string& directory)
{
    std::filesystem::create_directory(directory);

    std::set<uint32_t> map_layout_addresses;
    for(auto& [id, map] : world.maps())
        map_layout_addresses.insert(map->address());

    std::vector<uint32_t> sorted_addresses;
    sorted_addresses.reserve(map_layout_addresses.size());
    for(uint32_t addr : map_layout_addresses)
        sorted_addresses.emplace_back(addr);

    std::map<uint32_t, size_t> map_layout_sizes;
    for(size_t i=0 ; i<sorted_addresses.size() - 1 ; ++i)
        map_layout_sizes[sorted_addresses[i]] = sorted_addresses[i+1] - sorted_addresses[i];
    map_layout_sizes[*sorted_addresses.rbegin()] = 0;

    size_t total_size = 0;
//    size_t total_size_reenc = 0;

    uint32_t i=1;
    for(uint32_t addr : map_layout_addresses)
    {
        std::string map_id_as_str = std::to_string(i++);
        while(map_id_as_str.size() < 3)
            map_id_as_str = "0" + map_id_as_str;

        std::string base_path = directory + "map_layout_" + map_id_as_str + "/";
        std::filesystem::create_directory(base_path);

        MapLayout* layout = io::decode_map_layout(rom, addr);
        export_map_layout(layout, map_layout_sizes[addr], base_path);
        total_size += map_layout_sizes[addr];

//        ByteArray bar = io::encode_map_layout(layout);
//        rom.set_bytes(0x0, bar);
//        MapLayout* layout2 = io::decode_map_layout(rom, 0x0);
//        export_map_layout(layout2, bar.size(), base_path, "_reencoded");
//        total_size_reenc += bar.size();

        for(auto& [id, map] : world.maps())
        {
            if(map->address() == addr)
                export_map_metadata(world, map, base_path);
        }
    }
}
