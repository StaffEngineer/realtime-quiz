const { shuffleArray } = require('./utils');

describe('shuffleArray', () => {
    it('should shuffle an array in place', () => {
        const inputArray = [1, 2, 3, 4, 5];
        const originalArray = [...inputArray]; // Create a copy of the original array

        shuffleArray(inputArray);

        // The input array should be different from the original array after shuffling.
        expect(inputArray).not.toEqual(originalArray);
    });
});