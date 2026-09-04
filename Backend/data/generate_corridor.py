import json

def generate_corridor():
    nodes = []
    track_segments = []
    
    # 4 Main lines Y coordinates
    Y_UP_MAIN = 120
    Y_DN_MAIN = 170
    Y_UP_SLOW = 260
    Y_DN_SLOW = 310
    
    # Stations and X offsets
    stations = [
        {"code": "DLI", "name": "Delhi Junction", "x_in": 100, "x_mid": 220, "x_out": 360, "platforms": 4},
        {"code": "DSA", "name": "Delhi Shahdara", "x_in": 540, "x_mid": 650, "x_out": 760, "platforms": 2},
        {"code": "ANVR", "name": "Anand Vihar Terminal", "x_in": 960, "x_mid": 1100, "x_out": 1260, "platforms": 5},
        {"code": "SBB", "name": "Sahibabad Junction", "x_in": 1460, "x_mid": 1570, "x_out": 1680, "platforms": 3},
        {"code": "GZB", "name": "Ghaziabad Junction", "x_in": 1880, "x_mid": 2040, "x_out": 2200, "platforms": 6}
    ]
    
    node_id_map = {}
    
    def add_node(nid, ntype, x, y, state=\"NORMAL\"):
        node = {\"id\": nid, \"type\": ntype, \"position\": {\"x\": int(x), \"y\": int(y)}}
        if ntype == \"SIGNAL\":
            node[\"state\"] = \"RED\"
        elif ntype == \"SWITCH\":
            node[\"state\"] = state
            node[\"isLocked\"] = False
        nodes.append(node)
        node_id_map[nid] = node
        return nid

    def add_segment(sid, start_id, end_id, track_type=\"MAIN\", line=\"UP_MAIN\", speed=110, length=1000):
        seg = {
            \"id\": sid,
            \"startNodeId\": start_id,
            \"endNodeId\": end_id,
            \"trackType\": track_type,
            \"line\": line,
            \"speedLimit\": speed,
            \"length\": length,
            \"status\": \"CLEAR\",
            \"isOccupied\": False
        }
        track_segments.append(seg)
        return sid

    # Generate continuous through-lines from DLI to GZB with station blocks
    x_curr = 60
    
    # Starting approach signals at Delhi West
    add_node(\"SIG-DLI-IN-UPM\", \"SIGNAL\", x_curr, Y_UP_MAIN)
    add_node(\"SIG-DLI-IN-DNM\", \"SIGNAL\", x_curr, Y_DN_MAIN)
    add_node(\"SIG-DLI-IN-UPS\", \"SIGNAL\", x_curr, Y_UP_SLOW)
    add_node(\"SIG-DLI-IN-DNS\", \"SIGNAL\", x_curr, Y_DN_SLOW)
    
    prev_upm = \"SIG-DLI-IN-UPM\"
    prev_dnm = \"SIG-DLI-IN-DNM\"
    prev_ups = \"SIG-DLI-IN-UPS\"
    prev_dns = \"SIG-DLI-IN-DNS\"
    
    for stn in stations:
        code = stn[\"code\"]
        xin = stn[\"x_in\"]
        xmid = stn[\"x_mid\"]
        xout = stn[\"x_out\"]
        
        # In approach nodes
        upm_in = add_node(f\"{code}-UPM-IN\", \"JUNCTION\", xin, Y_UP_MAIN)
        dnm_in = add_node(f\"{code}-DNM-IN\", \"JUNCTION\", xin, Y_DN_MAIN)
        ups_in = add_node(f\"{code}-UPS-IN\", \"JUNCTION\", xin, Y_UP_SLOW)
        dns_in = add_node(f\"{code}-DNS-IN\", \"JUNCTION\", xin, Y_DN_SLOW)
        
        # Connect from previous section
        add_segment(f\"BLK-{prev_upm[:3]}-{code}-UPM\", prev_upm, upm_in, \"BLOCK_SECTION\", \"UP_MAIN\")
        add_segment(f\"BLK-{prev_dnm[:3]}-{code}-DNM\", prev_dnm, dnm_in, \"BLOCK_SECTION\", \"DN_MAIN\")
        add_segment(f\"BLK-{prev_ups[:3]}-{code}-UPS\", prev_ups, ups_in, \"BLOCK_SECTION\", \"UP_SLOW\")
        add_segment(f\"BLK-{prev_dns[:3]}-{code}-DNS\", prev_dns, dns_in, \"BLOCK_SECTION\", \"DN_SLOW\")
        
        # Station Crossovers at In-Throat (Scissors / Turnout)
        sw_in_upm = add_node(f\"SW-{code}-1\", \"SWITCH\", xin + 40, Y_UP_MAIN)
        sw_in_dnm = add_node(f\"SW-{code}-2\", \"SWITCH\", xin + 40, Y_DN_MAIN)
        add_segment(f\"TRK-{code}-IN-1\", upm_in, sw_in_upm, \"STATION_THROAT\")
        add_segment(f\"TRK-{code}-IN-2\", dnm_in, sw_in_dnm, \"STATION_THROAT\")
        # Crossover connecting UP & DN main
        sw_in_cross = add_node(f\"SW-{code}-X1\", \"SWITCH\", xin + 80, Y_DN_MAIN)
        add_segment(f\"XO-{code}-UP-DN\", sw_in_upm, sw_in_cross, \"CROSSOVER\", speed=30)
        add_segment(f\"TRK-{code}-IN-2B\", sw_in_dnm, sw_in_cross, \"STATION_THROAT\")
        
        # Connect slow lines throat
        add_segment(f\"TRK-{code}-UPS-IN\", ups_in, add_node(f\"{code}-UPS-THROAT\", \"JUNCTION\", xin + 80, Y_UP_SLOW), \"STATION_THROAT\")
        add_segment(f\"TRK-{code}-DNS-IN\", dns_in, add_node(f\"{code}-DNS-THROAT\", \"JUNCTION\", xin + 80, Y_DN_SLOW), \"STATION_THROAT\")
        
        # Platform tracks at station mid
        # PF 1 & 2 on Mains, Loop platforms on sides
        sig_home_upm = add_node(f\"SIG-{code}-UPM-HOME\", \"SIGNAL\", xin + 100, Y_UP_MAIN)
        sig_home_dnm = add_node(f\"SIG-{code}-DNM-HOME\", \"SIGNAL\", xin + 100, Y_DN_MAIN)
        add_segment(f\"TRK-{code}-HOME-UPM\", sw_in_upm, sig_home_upm)
        add_segment(f\"TRK-{code}-HOME-DNM\", sw_in_cross, sig_home_dnm)
        
        # Mid platform berths
        pf_upm = add_node(f\"{code}-PF-UPM\", \"JUNCTION\", xmid, Y_UP_MAIN)
        pf_dnm = add_node(f\"{code}-PF-DNM\", \"JUNCTION\", xmid, Y_DN_MAIN)
        pf_ups = add_node(f\"{code}-PF-UPS\", \"JUNCTION\", xmid, Y_UP_SLOW)
        pf_dns = add_node(f\"{code}-PF-DNS\", \"JUNCTION\", xmid, Y_DN_SLOW)
        
        add_segment(f\"PF-{code}-1\", sig_home_upm, pf_upm, \"PLATFORM\", \"UP_MAIN\", speed=50)
        add_segment(f\"PF-{code}-2\", sig_home_dnm, pf_dnm, \"PLATFORM\", \"DN_MAIN\", speed=50)
        add_segment(f\"PF-{code}-3\", f\"{code}-UPS-THROAT\", pf_ups, \"PLATFORM\", \"UP_SLOW\", speed=30)
        add_segment(f\"PF-{code}-4\", f\"{code}-DNS-THROAT\", pf_dns, \"PLATFORM\", \"DN_SLOW\", speed=30)
        
        # Out Throat
        sig_st_upm = add_node(f\"SIG-{code}-UPM-STARTER\", \"SIGNAL\", xout - 60, Y_UP_MAIN)
        sig_st_dnm = add_node(f\"SIG-{code}-DNM-STARTER\", \"SIGNAL\", xout - 60, Y_DN_MAIN)
        add_segment(f\"TRK-{code}-MID-UPM\", pf_upm, sig_st_upm)
        add_segment(f\"TRK-{code}-MID-DNM\", pf_dnm, sig_st_dnm)
        
        sig_st_ups = add_node(f\"SIG-{code}-UPS-STARTER\", \"SIGNAL\", xout - 60, Y_UP_SLOW)
        sig_st_dns = add_node(f\"SIG-{code}-DNS-STARTER\", \"SIGNAL\", xout - 60, Y_DN_SLOW)
        add_segment(f\"TRK-{code}-MID-UPS\", pf_ups, sig_st_ups)
        add_segment(f\"TRK-{code}-MID-DNS\", pf_dns, sig_st_dns)
        
        # Out Crossovers & Junctions
        sw_out_upm = add_node(f\"SW-{code}-OUT-UPM\", \"SWITCH\", xout - 20, Y_UP_MAIN)
        sw_out_dnm = add_node(f\"SW-{code}-OUT-DNM\", \"SWITCH\", xout - 20, Y_DN_MAIN)
        add_segment(f\"TRK-{code}-OUT-1\", sig_st_upm, sw_out_upm)
        add_segment(f\"TRK-{code}-OUT-2\", sig_st_dnm, sw_out_dnm)
        
        sw_out_ups = add_node(f\"SW-{code}-OUT-UPS\", \"SWITCH\", xout - 20, Y_UP_SLOW)
        sw_out_dns = add_node(f\"SW-{code}-OUT-DNS\", \"SWITCH\", xout - 20, Y_DN_SLOW)
        add_segment(f\"TRK-{code}-OUT-3\", sig_st_ups, sw_out_ups)
        add_segment(f\"TRK-{code}-OUT-4\", sig_st_dns, sw_out_dns)
        
        # Universal crossover to switch between Main and Slow line (bypassing blocks!)
        xo_out = add_node(f\"SW-{code}-XO-SLOW\", \"SWITCH\", xout + 20, Y_UP_SLOW)
        add_segment(f\"XO-{code}-MAIN-TO-SLOW\", sw_out_upm, xo_out, \"CROSSOVER\", speed=30)
        add_segment(f\"TRK-{code}-SLOW-CONNECT\", sw_out_ups, xo_out)
        
        # Station Exit Advanced Starters
        upm_out = add_node(f\"SIG-{code}-UPM-ADV\", \"SIGNAL\", xout + 50, Y_UP_MAIN)
        dnm_out = add_node(f\"SIG-{code}-DNM-ADV\", \"SIGNAL\", xout + 50, Y_DN_MAIN)
        ups_out = add_node(f\"SIG-{code}-UPS-ADV\", \"SIGNAL\", xout + 50, Y_UP_SLOW)
        dns_out = add_node(f\"SIG-{code}-DNS-ADV\", \"SIGNAL\", xout + 50, Y_DN_SLOW)
        
        add_segment(f\"TRK-{code}-ADV-UPM\", sw_out_upm, upm_out)
        add_segment(f\"TRK-{code}-ADV-DNM\", sw_out_dnm, dnm_out)
        add_segment(f\"TRK-{code}-ADV-UPS\", xo_out, ups_out)
        add_segment(f\"TRK-{code}-ADV-DNS\", sw_out_dns, dns_out)
        
        prev_upm = upm_out
        prev_dnm = dnm_out
        prev_ups = ups_out
        prev_dns = dns_out

    # Final terminus at Ghaziabad East
    final_upm = add_node(\"SIG-GZB-EXIT-UPM\", \"SIGNAL\", 2320, Y_UP_MAIN)
    final_dnm = add_node(\"SIG-GZB-EXIT-DNM\", \"SIGNAL\", 2320, Y_DN_MAIN)
    final_ups = add_node(\"SIG-GZB-EXIT-UPS\", \"SIGNAL\", 2320, Y_UP_SLOW)
    final_dns = add_node(\"SIG-GZB-EXIT-DNS\", \"SIGNAL\", 2320, Y_DN_SLOW)
    add_segment(\"BLK-GZB-OUT-UPM\", prev_upm, final_upm, \"BLOCK_SECTION\", \"UP_MAIN\")
    add_segment(\"BLK-GZB-OUT-DNM\", prev_dnm, final_dnm, \"BLOCK_SECTION\", \"DN_MAIN\")
    add_segment(\"BLK-GZB-OUT-UPS\", prev_ups, final_ups, \"BLOCK_SECTION\", \"UP_SLOW\")
    add_segment(\"BLK-GZB-OUT-DNS\", prev_dns, final_dns, \"BLOCK_SECTION\", \"DN_SLOW\")

    layout = {
        \"corridor\": {
            \"id\": \"DLI_GZB_CORRIDOR\",
            \"name\": \"Delhi - Anand Vihar - Sahibabad - Ghaziabad Quadruple Corridor\",
            \"lengthKm\": 24.5,
            \"stations\": stations
        },
        \"network\": {
            \"nodes\": nodes,
            \"trackSegments\": track_segments
        }
    }
    
    with open(\"Backend/data/delhi_gzb_corridor.json\", \"w\") as f:
        json.dump(layout, f, indent=2)
    print(f\"SUCCESS: Generated {len(nodes)} nodes and {len(track_segments)} track segments procedurally!\")

if __name__ == \"__main__\":
    generate_corridor()
