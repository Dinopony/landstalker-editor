
#include <string>
#include <iostream>

#include <landstalker_lib/tools/json.hpp>
#include <landstalker_lib/md_tools.hpp>
#include <landstalker_lib/tools/argument_dictionary.hpp>
#include <landstalker_lib/constants/offsets.hpp>
#include <landstalker_lib/exceptions.hpp>
#include <landstalker_lib/model/world.hpp>

void extract()
{
    // Load input ROM and tag known empty chunks of data to know where to inject code / data
    md::ROM rom("./input.md");
    rom.mark_empty_chunk(0x19314, 0x19514); // Empty space
    rom.mark_empty_chunk(0x11F380, 0x120000); // Empty space
    rom.mark_empty_chunk(0x1FFAC0, 0x200000); // Empty space
    rom.mark_empty_chunk(0x2A442, 0x2A840); // Debug menu code & data
    rom.mark_empty_chunk(0x1AF5FA, 0x1AF800); // Empty space

    World world(rom);


}

int main(int argc, char* argv[])
{
    int return_code = EXIT_SUCCESS;

    ArgumentDictionary args(argc, argv);

    std::cout << "======== Landstalker Editor v" << RELEASE << " ========\n\n";

    if(args.contains("permalink") && args.get_string("permalink").empty())
    {
        std::string permalink;
        std::cout << "Please specify a permalink: ";
        std::getline(std::cin, permalink);
        args.set_string("permalink", permalink);
    }

    try
    {
        extract();
    }
    catch(LandstalkerException& e)
    {
        std::cerr << "ERROR: " << e.what() << std::endl;
        return_code = EXIT_FAILURE;
    }

    if(args.get_boolean("pause", true))
    {
        std::cout << "\nPress any key to exit.";
        std::string dummy;
        std::getline(std::cin, dummy);
    }

    return return_code;
}
