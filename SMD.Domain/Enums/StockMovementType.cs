using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Domain.Enums;

public enum StockMovementType
{
    IN = 1,        // pranim, hyrje
    OUT = 2,       // dalje
    TRANSFER = 3,  // transfer brenda depos
    ADJUST = 4     // korrigjim, ndryshim
}