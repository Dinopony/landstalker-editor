
#include <string>
#include <iostream>

#include <landstalker_lib/model/world.hpp>
#include <landstalker_lib/tools/argument_dictionary.hpp>
#include <landstalker_lib/exceptions.hpp>

#include "exports.hpp"

void extract()
{
    // Load input ROM and tag known empty chunks of data to know where to inject code / data
    md::ROM rom("./input.md");

    World world(rom);

    export_blocksets_as_csv(world, "./blocksets/");
    export_map_palettes_as_csv(world, "./map_palettes/");
    export_tilesets(rom, "./tilesets/");
    export_maps(rom, world, "./maps/");
}

int main(int argc, char* argv[])
{
    int return_code = EXIT_SUCCESS;

    ArgumentDictionary args(argc, argv);

    std::cout << "======== Landstalker Editor v" << RELEASE << " ========\n\n";

    try
    {
        extract();
    }
    catch(LandstalkerException& e)
    {
        std::cerr << "ERROR: " << e.what() << std::endl;
        return_code = EXIT_FAILURE;
    }

    if(args.get_boolean("pause", false))
    {
        std::cout << "\nPress any key to exit.";
        std::string dummy;
        std::getline(std::cin, dummy);
    }

    return return_code;
}
