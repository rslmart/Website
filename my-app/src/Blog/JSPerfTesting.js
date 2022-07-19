import React from "react";

function JSPerfTesting() {
    // randomly generated N = 40 length array 0 <= A[N] <= 39
    const testArr = Array.from({length: 1000000}, () => Math.floor(Math.random() * 100));

    var startTime1 = performance.now()
    const array1 = testArr.filter(x => x > 90)
        .filter(x => x > 80)
        .filter(x => x > 70)
        .filter(x => x > 60)
        .filter(x => x > 50)
        .filter(x => x > 40)
        .filter(x => x > 30)
        .filter(x => x > 20);
    var endTime1 = performance.now()

    var startTime2 = performance.now()
    const array2 = testArr.filter(x => x > 90 && x > 80 && x > 70 && x > 60 && x > 50 && x > 40 && x > 30 && x > 20);
    var endTime2 = performance.now()

    return (
        <div>
            <p>Blog</p>
            <p>Multi Filter {endTime1 - startTime1}</p>
            <p>Combined Filter {endTime2 - startTime2}</p>
        </div>
    );
}

export default JSPerfTesting;