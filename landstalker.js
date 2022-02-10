const TILE_UNIVERSAL_BLOCKER = 1;
const TILE_NPC_BLOCKER = 2;
const TILE_LOCKED_DOOR = 3;
const TILE_RAFT_TRACK = 4;
const TILE_FLOOR_TYPE_BEGIN = 5;

function getBasePath(path) {
    var split = path.split("/");
    split.splice(split.length-1, 1);
    return split.join("/") + "/";
}

function getPathWithoutExtension(path) {
    var split = path.split(".");
    split.splice(split.length-1, 1);
    return split.join(".");
}

function findLayer(map, layerName) {
    for (var i=0 ; i < map.layerCount; ++i) {
        var layer = map.layerAt(i);
        if (layer.isTileLayer && layer.name == layerName) {
            return layer;
        }
    }
    return null;
}

function getLayerAsMatrix(map, layerName, defaultValue = null) {
    var layer = findLayer(map, layerName);
    if(!layer)
        return null;

    var tileLines = [];
    for(var y=0 ; y < layer.height ; ++y) {
        var line = [];
        for(var x=0 ; x < layer.width ; ++x) {
            var tile = layer.tileAt(x, y);
            line.push(tile ? tile.id : defaultValue);
        }
        tileLines.push(line);
    }

    return tileLines;
}

function valueForHeightmap(heightmapTileId, floorTypeTileId, flagsTileId) {
    var heightValue = 0;
    var flagValue = 0;
    var floorValue = 0;

    if(heightmapTileId == null)
        flagValue = 4; // No height = tile is blocked
    else
        heightValue = heightmapTileId;

    if(flagsTileId == TILE_UNIVERSAL_BLOCKER) // Universal blocker
        flagValue = 4;
    else if(flagsTileId == TILE_NPC_BLOCKER) // NPC blocker
        flagValue = 2;
    else if(flagsTileId == TILE_LOCKED_DOOR) // Locked door
        flagValue = 6;
    else if(flagsTileId == TILE_RAFT_TRACK) // Raft track
        flagValue = 1;

    if(floorTypeTileId >= TILE_FLOOR_TYPE_BEGIN)
        floorValue = floorTypeTileId + 1 - TILE_FLOOR_TYPE_BEGIN ;
    
    return flagValue * 0x1000 + heightValue * 0x100 + floorValue;
}

function outputMatrixToCSVFile(filename, data) {
    var file = new TextFile(filename, TextFile.WriteOnly);
    for(var y=0 ; y<data.length ; ++y) {
        file.write(data[y].join(","));
        file.write("\n");
    }
    file.commit();
}

function outputToJSONFile(filename, obj) {
    var file = new TextFile(filename, TextFile.WriteOnly);
    file.write(JSON.stringify(obj));obj
    file.commit();
}

function parseJSONFile(path) {
    var file = new TextFile(path, TextFile.ReadOnly);
    var fileContents = file.readAll();
    return JSON.parse(fileContents);
}

/////////////////////////////////////////////////////////////////////////////////

function matrixFromCSVFile(path) {
    var file = new TextFile(path, TextFile.ReadOnly);
    var matrix = [];
    while(!file.atEof) {
        var line = file.readLine();
        matrix.push(line.split(','));
    }

    tiled.log("Read " + matrix.length + " lines from CSV file '" + path + "'");
    return matrix;
}

function heightmapTileFromData(heightmapValue, heightmapTileset) {
    var heightValue = (heightmapValue & 0x0F00) >> 8;
    var blockedTile = (heightmapValue & 0x4000);
    if(heightValue == 0 && blockedTile)
        return null;

    return heightmapTileset.tile(heightValue);
}

function flagsTileFromData(heightmapValue, metaTileset) {
    var heightValue = (heightmapValue & 0x0F00) >> 8;
    var flagValue = (heightmapValue & 0xF000) >> 12;

    if(flagValue == 1)
        return metaTileset.tile(TILE_RAFT_TRACK);
    if(flagValue == 2)
        return metaTileset.tile(TILE_NPC_BLOCKER);
    if(flagValue == 4 && heightValue != 0)
        return metaTileset.tile(TILE_UNIVERSAL_BLOCKER);
    if(flagValue == 6)
        return metaTileset.tile(TILE_LOCKED_DOOR);

    return metaTileset.tile(0);
}

function floorTypeTileFromData(heightmapValue, metaTileset) {
    var floorValue = (heightmapValue & 0x00FF);
    if(floorValue == 0)
        return metaTileset.tile(0);

    return metaTileset.tile(TILE_FLOOR_TYPE_BEGIN + floorValue - 1);
}

var customMapFormat = {
    name: "Landstalker map",
    extension: "lsmap",

    read: function(fileName) {
        var map = new TileMap();
        map.orientation = TileMap.Isometric;
        map.tileWidth = 32;
        map.tileHeight = 16;
        map.layerDataFormat = TileMap.CSV;
        map.backgroundColor = "#000000";
        
        var folder = getBasePath(fileName);

        var heightmapTileset = tiled.open(folder + "../../resources/heightmap_flat.tsx");
        var metaTileset = tiled.open(folder + "../../resources/meta_tiles.tsx");
        var entitiesTileset = tiled.open(folder + "../../resources/entities.tsx");
               
        // Read .lsmap file to get map-specific properties
        var mapMetadata = parseJSONFile(fileName);
        for(key in mapMetadata)
        {
            if(key != "entities")
                map.setProperty(key, mapMetadata[key]);
        }
     
        // Read layout metadata file to get properties related to map layout (common to all maps using this layout)
        var mapLayoutMetadata = parseJSONFile(folder + "layout_metadata.json");
        for(key in mapLayoutMetadata)
            map.setProperty(key, mapLayoutMetadata[key]);

        var blockset = buildBlockset(map, fileName);
        map.addTileset(blockset);
        map.addTileset(heightmapTileset);
        map.addTileset(metaTileset);
        map.addTileset(entitiesTileset);

        // Read the map layout files
        var heightmapDataMatrix = matrixFromCSVFile(folder + "heightmap.csv");
        var backgroundLayerMatrix = matrixFromCSVFile(folder + "background.csv");
        var foregroundLayerMatrix = matrixFromCSVFile(folder + "foreground.csv");

        map.height = Math.max(heightmapDataMatrix.length, backgroundLayerMatrix.length, foregroundLayerMatrix.length);
        map.width = Math.max(heightmapDataMatrix[0].length, backgroundLayerMatrix[0].length, foregroundLayerMatrix[0].length);

        var backgroundLayer = new TileLayer("Background");
        backgroundLayer.offset.x = 16;
        var backgroundLayerEdit = backgroundLayer.edit();
        for(var y=0 ; y<backgroundLayerMatrix.length ; ++y) {
            for(var x=0 ; x<backgroundLayerMatrix[y].length ; ++x) {
                var tileIndex = backgroundLayerMatrix[y][x];
                while(tileIndex >= blockset.tileCount)
                    blockset.addTile();
                backgroundLayerEdit.setTile(x, y, blockset.tile(tileIndex));
            }
        }
        backgroundLayerEdit.apply();
        map.addLayer(backgroundLayer);

        var foregroundLayer = new TileLayer("Foreground");
        var foregroundLayerEdit = foregroundLayer.edit();
        for(var y=0 ; y<foregroundLayerMatrix.length ; ++y) {
            for(var x=0 ; x<foregroundLayerMatrix[y].length ; ++x) {
                var tileIndex = foregroundLayerMatrix[y][x];
                while(tileIndex >= blockset.tileCount)
                    blockset.addTile();
                foregroundLayerEdit.setTile(x, y, blockset.tile(foregroundLayerMatrix[y][x]));
            }
        }
        foregroundLayerEdit.apply();
        map.addLayer(foregroundLayer);

        var heightmapLayer = new TileLayer("Heightmap");
        heightmapLayer.visible = false;
        var heightmapLayerEdit = heightmapLayer.edit();
        
        var flagsLayer = new TileLayer("Flags");
        flagsLayer.visible = false;
        var flagsLayerEdit = flagsLayer.edit();

        var floorTypesLayer = new TileLayer("Floor Types");
        floorTypesLayer.visible = false;
        var floorTypesLayerEdit = floorTypesLayer.edit();

        for(var y=0 ; y<heightmapDataMatrix.length ; ++y) {
            for(var x=0 ; x<heightmapDataMatrix[y].length ; ++x) {
                var heightmapValue = parseInt(heightmapDataMatrix[y][x], 10);
                heightmapLayerEdit.setTile(x, y, heightmapTileFromData(heightmapValue, heightmapTileset));
                flagsLayerEdit.setTile(x, y, flagsTileFromData(heightmapValue, metaTileset));
                floorTypesLayerEdit.setTile(x, y, floorTypeTileFromData(heightmapValue, metaTileset));
            }
        }
        heightmapLayerEdit.apply();
        flagsLayerEdit.apply();
        floorTypesLayerEdit.apply();

        var tilemapOffsetX = map.property("tilemap_offset_x") ?? 12;
        var tilemapOffsetY = map.property("tilemap_offset_y") ?? 12;

        var heightmapOffset = { x: tilemapOffsetX - 12, y: tilemapOffsetY - 12 };
        var metadataLayers = [heightmapLayer, flagsLayer, floorTypesLayer];
        for(var layer of metadataLayers) {
            layer.offset.x = heightmapOffset.y * 16.0 - heightmapOffset.x * 16.0;
            layer.offset.y = - heightmapOffset.x * 8.0 - heightmapOffset.y * 8.0;
            map.addLayer(layer);
        }
        
        var objectsLayer = new ObjectGroup("Entities");
        objectsLayer.offset.y = 16;
        objectsLayer.opacity = 0.8;
        var entityIndex=1;
        for(entityDesc of mapMetadata.entities)
        {
            var entity = new MapObject(entityDesc["entityType"]);
            entityIndex += 1;

            entity.tile = entitiesTileset.tile(entityDesc["entityTypeId"]);
            entity.width = 32;
            entity.height = 48;
            entity.x = (entityDesc["position"]["x"] - tilemapOffsetX) * 16;
            entity.y = (entityDesc["position"]["y"] - tilemapOffsetY) * 16;
            entity.setProperty("position_z", entityDesc["position"]["z"]);
            entity.setProperty("orientation", entityDesc["orientation"]);
            entity.setProperty("palette", entityDesc["palette"]);
            entity.setProperty("speed", entityDesc["speed"]);
            entity.setProperty("fightable", entityDesc["fightable"]);
            entity.setProperty("liftable", entityDesc["liftable"]);
            entity.setProperty("canPassThrough", entityDesc["canPassThrough"]);
            entity.setProperty("appearAfterPlayerMovedAway", entityDesc["appearAfterPlayerMovedAway"]);
            entity.setProperty("gravityImmune", entityDesc["gravityImmune"]);
            entity.setProperty("talkable", entityDesc["talkable"]);
            entity.setProperty("dialogue", entityDesc["dialogue"] ?? 0);
            entity.setProperty("behaviorId", entityDesc["behaviorId"]);
            entity.setProperty("useTilesFromOtherEntity", entityDesc["useTilesFromOtherEntity"]);
            entity.setProperty("flagUnknown_2_3", entityDesc["flagUnknown_2_3"]);
            entity.setProperty("flagUnknown_2_4", entityDesc["flagUnknown_2_4"]);

            objectsLayer.addObject(entity);
        }
        map.addLayer(objectsLayer);


        floorTypesLayer.visible = false;
        var floorTypesLayerEdit = floorTypesLayer.edit();

        
        return map;
    },

    write: function(map, fileName) {
        // Load layers
        var backgroundLayer = getLayerAsMatrix(map, "Background", 0);
        if(!backgroundLayer)
            return "'Background' layer missing";

        var foregroundLayer = getLayerAsMatrix(map, "Foreground", 0);
        if(!foregroundLayer)
            return "'Foreground' layer missing";

        var heightmapLayer = getLayerAsMatrix(map, "Heightmap");
        if(!heightmapLayer)
            return "'Heightmap' layer missing";
        
        var floorTypesLayer = getLayerAsMatrix(map, "Floor Types");
        if(!floorTypesLayer)
            return "'Floor Types' layer missing";

        var flagsLayer = getLayerAsMatrix(map, "Flags");
        if(!flagsLayer)
            return "'Flags' layer missing";

        // Build heightmap data matrix from the three metadata layers
        var heightmapDataMatrix = [];
        for(var y=0 ; y<heightmapLayer.length ; ++y)
        {
            var line = [];
            for(var x=0 ; x<heightmapLayer[y].length ; ++x) {
                var heightmapTileId = heightmapLayer[y][x];
                var floorTypeTileId = floorTypesLayer[y][x];
                var flagsTileId = flagsLayer[y][x];
                line.push(valueForHeightmap(heightmapTileId, floorTypeTileId, flagsTileId));
            }
            heightmapDataMatrix.push(line);
        }

        // Build metadata objects that will get exported to JSON files
        var mapLayoutMetadataJSON = {
            tilemap_offset_x: map.property("tilemap_offset_x"),
            tilemap_offset_y: map.property("tilemap_offset_y")
        };

        var mapMetadataJSON = {};
        for(key in map.properties())
        {
            if(key in mapLayoutMetadataJSON)
                continue;
            mapMetadataJSON[key] = map.property(key);
        }

        // Output data to their respective files
        var folder = getBasePath(fileName);

        outputMatrixToCSVFile(folder + "background.csv", backgroundLayer);
        outputMatrixToCSVFile(folder + "foreground.csv", foregroundLayer);
        outputMatrixToCSVFile(folder + "heightmap.csv", heightmapDataMatrix);
        outputToJSONFile(folder + "layout_metadata.json", mapLayoutMetadataJSON);

        outputToJSONFile(fileName, mapMetadataJSON);
    }
}

tiled.registerMapFormat("landstalker_map", customMapFormat);

/////////////////////////////////////////////////////////////////////

function createBlocksetImage(basePath, blocks, tilesetId, paletteId)
{
    // Tileset file is 4bpp format
    var tilesetPath = basePath + "tilesets/" + tilesetId + ".bin";
    var tilesetFile = new BinaryFile(tilesetPath, BinaryFile.ReadOnly);
    var tilesetFileBytes = new Uint8Array(tilesetFile.readAll());
    var tilesetPixels = [];
    for(var byte of tilesetFileBytes)
    {
        tilesetPixels.push((byte & 0xF0) >> 4);
        tilesetPixels.push(byte & 0x0F);
    }

    const BLOCKS_PER_COLUMN = 16;
    var blocksetImage = new Image(
        BLOCKS_PER_COLUMN * 16, 
        Math.ceil(blocks.length / BLOCKS_PER_COLUMN) * 16, 
        Image.Format_RGBA64);
    tiled.log("Blockset image is " + blocksetImage.width + " x " + blocksetImage.height);

    var palettePath = basePath + "map_palettes/" + paletteId + ".csv";
    var palette = matrixFromCSVFile(palettePath).reduce((acc, val) => [ ...acc, ...val ], [])
    palette.splice(0,0,"#00000000","#ffcccccc");
    palette.push("#ff000000");
    blocksetImage.setColorTable(palette);
    blocksetImage.fill("#00000000");

    for(var i=0 ; i<blocks.length ; ++i) {
        var block = blocks[i];
        var blockPosInBlockset = {
            x: (i % BLOCKS_PER_COLUMN) * 16,
            y: Math.floor(i / BLOCKS_PER_COLUMN) * 16
        };
        
        for(var tile=0 ; tile<4 ; ++tile)
        {
            var tileIndex = block[tile*2];
            var attrs = block[tile*2+1];
            var priority = attrs.indexOf('p') >= 0;
            var hflip = attrs.indexOf('h') >= 0;
            var vflip = attrs.indexOf('v') >= 0;

            var tileOriginInBlockset = {
                x: blockPosInBlockset.x + ((tile%2) * 8),
                y: blockPosInBlockset.y + (Math.floor(tile/2) * 8)
            };

            for(var tilePixel=0 ; tilePixel < 64 ; ++tilePixel)
            {
                var pixelInTileset = tilesetPixels[tileIndex*64 + tilePixel];
                var color = palette[pixelInTileset];
                
                var x = tileOriginInBlockset.x;
                if(hflip)
                    x += (7 - (tilePixel % 8));
                else
                    x += (tilePixel % 8);
            
                var y = tileOriginInBlockset.y;
                if(vflip)
                    y += (7 - Math.floor(tilePixel / 8));
                else                  
                    y += Math.floor(tilePixel / 8);

                blocksetImage.setPixelColor(x, y, color);
//                tiled.log("color[" + pixelInTileset + "] = " + color + "--->" + blocksetImage.pixelColor(x,y));
            }
        
            if(priority && i>0) {
                for(x=0 ; x<4 ; ++x)
                    for(y=0 ; y<4-x ; ++y)
                        blocksetImage.setPixelColor(tileOriginInBlockset.x + x, tileOriginInBlockset.y + y, "#88FF0000");
            }
        }
    }
    
    return blocksetImage;
}

function buildBlockset(map, path) 
{
    var basePath = getBasePath(path) + "../../";
    var primaryBlocksetId = map.property("blockset_primary") ?? 1;
    var secondaryBlocksetId = map.property("blockset_secondary") ?? 1;
    var paletteId = map.property("palette_id") ?? 0;

    var blocksetPath = basePath + "blocksets/renders/" + primaryBlocksetId + "_" + secondaryBlocksetId + "_" + paletteId + ".png";

    var primaryBlocks = matrixFromCSVFile(basePath + "blocksets/blockset_" + primaryBlocksetId + "_0.csv");
    if(secondaryBlocksetId > 0)
    {
        var secondaryBlocks = matrixFromCSVFile(basePath + "blocksets/blockset_" + primaryBlocksetId + "_" + secondaryBlocksetId + ".csv");
    }
    var blocks = primaryBlocks.concat(secondaryBlocks);

    var tilesetId = primaryBlocksetId & 0x1F;
    var blocksetImage = createBlocksetImage(basePath, blocks, tilesetId, paletteId);
    blocksetImage.save(blocksetPath);

    var newBlockset = new Tileset("blockset");
    newBlockset.tileWidth = 16;
    newBlockset.tileHeight = 16;
    newBlockset.loadFromImage(blocksetImage, blocksetPath);
    return newBlockset;
}

var action = tiled.registerAction("build_blockset", function(action) {
    var map = tiled.activeAsset;
    if(!map.isTileMap)
    {
        tiled.error("Active asset is not a tilemap, cannot build blockset.");
        return;
    }

    var newBlockset = buildBlockset(map, map.fileName);

    for(var tileset of map.tilesets) 
    {
        if(tileset.name == "blockset")
        {
            tiled.log("Replaced blockset by new one");
            map.replaceTileset(tileset, newBlockset);
            break;
        }
    }
});

action.text = "Build blockset";
action.shortcut = "Ctrl+K";

tiled.extendMenu("Map", [
    { action: "build_blockset", before: "Properties" },
    { separator: true }
]);
